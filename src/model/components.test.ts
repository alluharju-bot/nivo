import { expect, it, vi } from 'vitest';
import { asComponent, synchronizeComponents, uniqueComponents } from './components';
import { freshProject, makeBody, parseProject } from './project';
import { translateSelection } from './groups';
import { removeSelection, selectionUnit } from './selection';
import { defaultAppearance } from './materials';

it('copies model parts as linked instances without requiring a component conversion first', () => {
  const source = { ...makeBody(600, 400, 18), purpose: 'component' as const };
  const other = makeBody(100, 100, 50);
  const before = { ...freshProject(), bodies: [source, other] };
  const copied = translateSelection(before, [source.id, other.id], [700, 0, 0], true).project;
  expect(copied.bodies[0].component?.id).toBe(copied.bodies[2].component?.id);
  expect(copied.bodies[0].component?.id).toBeTruthy();
  expect(copied.bodies[3].component?.id).toBeTruthy();
  expect(copied.bodies[3].component?.id).toBe(copied.bodies[1].component?.id);
  expect(copied.bodies[3].component?.id).not.toBe(copied.bodies[2].component?.id);
  expect(parseProject(JSON.stringify(copied)).bodies[2].component).toEqual(
    copied.bodies[2].component,
  );
  expect(uniqueComponents(copied, [copied.bodies[2].id]).bodies[2].component).toBeUndefined();
});

it('making a group unique preserves its internal copies and detaches every outside instance', () => {
  const a = asComponent(makeBody()),
    b = { ...a, id: 'inside' },
    c = { ...a, id: 'outside' };
  const p = { ...freshProject(), bodies: [a, b, c] };
  const unique = uniqueComponents(p, [a.id, b.id], true);
  expect(unique.bodies[0].component?.id).toBe(unique.bodies[1].component?.id);
  expect(unique.bodies[0].component?.id).not.toBe(c.component!.id);
  expect(unique.bodies[2]).toBe(c);
  expect(unique.bodies[0].feature).toBe(a.feature);
});

it('local texture placement keeps color and finish shared in both directions', async () => {
  const a = asComponent({ ...makeBody(), appearance: defaultAppearance('pine') });
  const b = { ...a, id: 'copy' };
  const before = { ...freshProject(), bodies: [a, b] };
  const placed = {
    ...a,
    localTexture: true,
    appearance: { ...a.appearance!, texture: { ...a.appearance!.texture, offsetX: 98 } },
  };
  const own = await synchronizeComponents(before, { ...before, bodies: [placed, b] }, vi.fn());
  expect(own.bodies[1]).toEqual(b);
  const painted = {
    ...placed,
    color: '#445566',
    appearance: { ...placed.appearance, roughness: 0.12 },
  };
  const shared = await synchronizeComponents(own, { ...own, bodies: [painted, b] }, vi.fn());
  expect(shared.bodies[1].color).toBe('#445566');
  expect(shared.bodies[1].appearance!.roughness).toBe(0.12);
  expect(shared.bodies[1].appearance!.texture.offsetX).toBe(0);
  const next = await synchronizeComponents(
    shared,
    { ...shared, bodies: [shared.bodies[0], { ...shared.bodies[1], color: '#112233' }] },
    vi.fn(),
  );
  expect(next.bodies[0].color).toBe('#112233');
  expect(next.bodies[0].appearance!.texture.offsetX).toBe(98);
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
