import { expect, it } from 'vitest';
import { freshProject, makeBody, parseProject } from './project';
import { repeatTranslation } from './repeat';
import { groupBodies } from './groups';
import { asComponent } from './components';

it('repeats linked assembly copies at exact intervals, retaining nested groups and references', () => {
  const a = { ...asComponent(makeBody(18, 600, 800)), groupId: 'child' };
  const b = { ...makeBody(18, 600, 800, [582, 0, 0]), groupId: 'root' };
  const project = {
    ...freshProject(),
    bodies: [a, b],
    groups: [
      { id: 'root', name: 'Kaappi', hidden: false, kind: 'assembly' as const },
      { id: 'child', name: 'Runko', hidden: false, parentId: 'root' },
    ],
    dimensions: [
      { id: 'width', bodyId: a.id, axis: 'x' as const, from: 'min' as const, to: 'max' as const },
    ],
  };
  const result = repeatTranslation(project, [a.id, b.id], [650.125, 0, 0], 3, true, 'root');
  expect(result.project.bodies).toHaveLength(8);
  expect(result.project.groups).toHaveLength(8);
  expect(result.project.groups.filter((g) => !g.parentId).map((g) => g.name)).toEqual([
    'Kaappi',
    'Kaappi (kopio #1)',
    'Kaappi (kopio #2)',
    'Kaappi (kopio #3)',
  ]);
  expect(result.project.dimensions).toHaveLength(4);
  expect(groupBodies(result.project, result.groupId!)).toHaveLength(2);
  expect(
    result.project.bodies
      .filter((part) => part.component?.id === a.component!.id)
      .map((part) => part.origin[0]),
  ).toEqual([0, 650.125, 1300.25, 1950.375]);
  expect(
    new Set(
      result.project.bodies.filter((part) => part.component).map((part) => part.component!.id),
    ).size,
  ).toBe(2);
  expect(parseProject(JSON.stringify(result.project)).bodies).toHaveLength(8);
  expect(project.bodies).toEqual([a, b]);
  const next = repeatTranslation(
    result.project,
    result.ids,
    [650.125, 0, 0],
    1,
    true,
    result.groupId,
  );
  expect(next.project.bodies.at(-2)!.origin[0]).toBe(2600.5);
  expect(next.project.groups.find((g) => g.id === next.groupId)?.name).toBe('Kaappi (kopio #4)');
});

it('repeats a signed move on the same selection, preserving all other coordinates', () => {
  const a = makeBody(20, 30, 40, [3.125, 1000, -100]);
  const b = makeBody();
  const project = { ...freshProject(), bodies: [a, b] };
  const next = repeatTranslation(project, [a.id], [0, -150.25, 0], 3, false);
  expect(next.ids).toEqual([a.id]);
  expect(next.project.bodies[0].origin).toEqual([3.125, 549.25, -100]);
  expect(next.project.bodies[1]).toBe(b);
});

it('rejects invalid repeats, missing selection, Hold, project capacity and coordinate overflow atomically', () => {
  const part = makeBody();
  const project = { ...freshProject(), bodies: [part] };
  for (const count of [0, -1, 1.5, NaN, 1001])
    expect(() => repeatTranslation(project, [part.id], [10, 0, 0], count, true)).toThrow();
  expect(() => repeatTranslation(project, [part.id], [0, 0, 0], 2, true)).toThrow();
  expect(() => repeatTranslation(project, [part.id, 'missing'], [10, 0, 0], 2, true)).toThrow();
  expect(() => repeatTranslation(project, [part.id], [60000, 0, 0], 2, true)).toThrow(
    'sijaintialueen',
  );
  expect(() =>
    repeatTranslation(
      { ...project, bodies: [{ ...part, locked: true }] },
      [part.id],
      [10, 0, 0],
      2,
      true,
    ),
  ).toThrow('kiinnitetty');
  const many = { ...project, bodies: Array.from({ length: 100 }, () => makeBody()) };
  expect(() =>
    repeatTranslation(
      many,
      many.bodies.map((b) => b.id),
      [10, 0, 0],
      100,
      true,
    ),
  ).toThrow('rajan');
  expect(project.bodies).toEqual([part]);
});
