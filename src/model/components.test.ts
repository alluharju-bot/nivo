import { expect, it, vi } from 'vitest';
import { asComponent, synchronizeComponents, uniqueComponents } from './components';
import { freshProject, makeBody, parseProject } from './project';
import { translateSelection } from './groups';
import { removeSelection, selectionUnit } from './selection';

it('copies components as linked instances and leaves ordinary bodies independent', () => {
  const source = { ...makeBody(600, 400, 18), purpose: 'component' as const };
  const other = makeBody(100, 100, 50);
  const before = { ...freshProject(), bodies: [source, other] };
  const copied = translateSelection(before, [source.id, other.id], [700, 0, 0], true).project;
  expect(copied.bodies[0].component?.id).toBe(copied.bodies[2].component?.id);
  expect(copied.bodies[0].component?.id).toBeTruthy();
  expect(copied.bodies[3].component).toBeUndefined();
  expect(parseProject(JSON.stringify(copied)).bodies[2].component).toEqual(
    copied.bodies[2].component,
  );
  expect(uniqueComponents(copied, [copied.bodies[2].id]).bodies[2].component).toBeUndefined();
});

it('keeps placement, names, visibility and local material independent; shared appearance propagates', async () => {
  const a = asComponent(makeBody(100, 200, 30));
  const b = { ...a, id: 'copy', origin: [500, 0, 0] as [number, number, number] };
  const before = { ...freshProject(), bodies: [a, b] },
    instantiate = vi.fn();
  const moved = translateSelection(before, [a.id], [10, 0, 0]).project;
  expect((await synchronizeComponents(before, moved, instantiate)).bodies[1]).toEqual(b);
  expect(instantiate).not.toHaveBeenCalled();
  const painted = { ...before, bodies: [{ ...a, color: '#123456' }, b] };
  expect((await synchronizeComponents(before, painted, instantiate)).bodies[1].color).toBe(
    '#123456',
  );
  const local = { ...before, bodies: [{ ...a, color: '#123456', localMaterial: true }, b] };
  expect((await synchronizeComponents(before, local, instantiate)).bodies[1].color).toBe(b.color);
});

it('rejects geometry propagation into held copies and rejects conflicting family edits', async () => {
  const a = asComponent(makeBody(100, 200, 30)),
    b = { ...a, id: 'copy', locked: true };
  const before = { ...freshProject(), bodies: [a, b] },
    edit = { ...a, feature: { ...a.feature, width: 120 } };
  await expect(
    synchronizeComponents(before, { ...before, bodies: [edit, b] }, vi.fn()),
  ).rejects.toThrow('Hold');
  await expect(
    synchronizeComponents(before, { ...before, bodies: [edit, { ...edit, id: 'copy' }] }, vi.fn()),
  ).rejects.toThrow('uniikkeja');
});

it('selects nested assemblies one level at a time, copies their hierarchy and deletes atomically', () => {
  const groups = [
    { id: 'outer', name: 'Tuote', kind: 'assembly' as const, hidden: false },
    { id: 'inner', name: 'Laatikko', kind: 'assembly' as const, parentId: 'outer', hidden: false },
  ];
  const a = { ...makeBody(), groupId: 'inner' },
    b = { ...makeBody(), groupId: 'outer' },
    free = makeBody();
  const project = { ...freshProject(), groups, bodies: [a, b, free] };
  expect(selectionUnit(project, a.id).ids).toEqual([a.id, b.id]);
  expect(selectionUnit(project, a.id, 'outer').groupId).toBe('inner');
  expect(selectionUnit(project, a.id, 'inner').ids).toEqual([a.id]);
  const copy = translateSelection(project, [a.id, b.id], [1000, 0, 0], true);
  expect(copy.project.groups).toHaveLength(4);
  expect(copy.project.bodies[3].groupId).not.toBe('inner');
  expect(removeSelection(project, [a.id, b.id]).bodies).toEqual([free]);
  expect(() =>
    removeSelection({ ...project, groups: [{ ...groups[0], locked: true }, groups[1]] }, [
      a.id,
      b.id,
    ]),
  ).toThrow('Hold');
});
