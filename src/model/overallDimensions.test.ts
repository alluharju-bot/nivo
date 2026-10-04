import { expect, it } from 'vitest';
import { addOverallDimensions } from './dimensions';
import { dimensionValue, freshProject, makeBody, parseProject, type Project } from './project';
import { dissolveGroup, translateSelection } from './groups';
import { removeSelection } from './selection';
import { History } from './history';
import { createSheet } from '../drawing/svg';

function fixture() {
  const a = { ...makeBody(200, 100, 20), groupId: 'root' };
  const b = { ...makeBody(200, 100, 20, [300, 0, 0]), groupId: 'child' };
  const project: Project = {
    ...freshProject(),
    bodies: [a, b],
    groups: [
      { id: 'root', name: 'Kaappirivi', hidden: false },
      { id: 'child', name: 'Kaappi', parentId: 'root', kind: 'assembly', hidden: false },
    ],
  };
  return { a, b, project };
}
it('measures current extrema when parts change order, across history and file reload', () => {
  const { a, b, project } = fixture();
  const p = addOverallDimensions(project, { kind: 'parts', ids: [a.id, b.id] }, ['x']);
  expect(dimensionValue(p, p.dimensions[0])).toBe(500);
  const moved = translateSelection(p, [a.id], [600, 0, 0]).project;
  expect(dimensionValue(moved, moved.dimensions[0])).toBe(500);
  const sheet = createSheet(
    moved,
    { visible: [], hidden: [], viewBox: [300, -20, 500, 20] },
    'front',
    5,
  );
  expect(sheet.svg).toContain('data-mm="500"');
  expect(sheet.orphanCount).toBe(0);
  expect(
    addOverallDimensions(moved, { kind: 'parts', ids: [b.id, a.id] }, ['x']).dimensions,
  ).toHaveLength(1);
  const history = new History(p);
  history.commit(moved);
  expect(history.undo().bodies[0].origin).toEqual([0, 0, 0]);
  const restored = parseProject(JSON.stringify(history.redo()));
  expect(dimensionValue(restored, restored.dimensions[0])).toBe(500);
});
it('follows nested group membership, flags removed groups and missing explicit parts', () => {
  const { a, b, project } = fixture();
  let p = addOverallDimensions(project, { kind: 'group', groupId: 'root' }, ['x']);
  const d = p.dimensions[0];
  expect(dimensionValue(p, d)).toBe(500);
  p = { ...p, bodies: [...p.bodies, { ...makeBody(100, 10, 10, [900, 0, 0]), groupId: 'child' }] };
  expect(dimensionValue(p, d)).toBe(1000);
  p = removeSelection(p, [a.id]);
  expect(p.dimensions).toContain(d);
  expect(dimensionValue(p, d)).toBe(700);
  expect(dimensionValue(dissolveGroup(p, 'root'), d)).toBeNull();
  const explicit = addOverallDimensions(project, { kind: 'parts', ids: [a.id, b.id] }, ['x']);
  const missing = removeSelection(explicit, [a.id]);
  expect(missing.dimensions).toHaveLength(1);
  expect(dimensionValue(missing, missing.dimensions[0])).toBeNull();
  expect(
    createSheet(missing, { visible: [], hidden: [], viewBox: [0, 0, 10, 10] }, 'front', 5)
      .orphanCount,
  ).toBe(1);
});
it('copies group dimensions onto the new group, and part-set dimensions onto the new parts', () => {
  const { a, b, project } = fixture();
  const p = addOverallDimensions(
    addOverallDimensions(project, { kind: 'group', groupId: 'root' }, ['x']),
    { kind: 'parts', ids: [a.id, b.id] },
    ['z'],
  );
  const copied = translateSelection(p, [a.id, b.id], [1000, 0, 0], true, 'root');
  expect(copied.project.dimensions).toHaveLength(4);
  expect(copied.project.dimensions[2]).toMatchObject({
    target: { kind: 'group', groupId: copied.groupId },
  });
  expect(copied.project.dimensions[3]).toMatchObject({
    target: { kind: 'parts', ids: copied.ids },
  });
  expect(dimensionValue(copied.project, copied.project.dimensions[2])).toBe(500);
});
it('migrates earlier projects without reinterpreting point dimensions as overall dimensions', () => {
  const { a, project } = fixture();
  const d = {
    id: 'old',
    kind: 'points',
    start: { point: [0, 0, 0] },
    end: { point: [500, 0, 0] },
    fallback: [
      [0, 0, 0],
      [500, 0, 0],
    ],
    axis: 'x',
    normal: [0, 0, 1],
    offset: [0, -30, 0],
  };
  const restored = parseProject(JSON.stringify({ ...project, version: 7, dimensions: [d] }));
  expect(restored.version).toBe(8);
  expect(restored.dimensions).toEqual([d]);
  expect(
    dimensionValue(
      translateSelection(restored, [a.id], [600, 0, 0]).project,
      restored.dimensions[0],
    ),
  ).toBe(500);
});
