import { expect, it, vi } from 'vitest';
import { freshProject, makeBody } from './project';
import { assertHolds } from './holds';
import { asComponent, synchronizeComponents } from './components';

it('protects held geometry, placement, appearance and removal until a separate unlock', () => {
  const part = { ...makeBody(), locked: true };
  const before = { ...freshProject(), bodies: [part] };
  for (const patch of [
    { feature: { ...part.feature, height: 80 } },
    { origin: [1, 2, 3] as [number, number, number] },
    { color: '#123456' },
    { name: 'changed' },
    { groupId: 'other' },
  ])
    expect(() => assertHolds(before, { ...before, bodies: [{ ...part, ...patch }] })).toThrow(
      'Hold',
    );
  expect(() => assertHolds(before, { ...before, bodies: [] })).toThrow('Hold');
  expect(() =>
    assertHolds(before, { ...before, bodies: [{ ...part, hidden: true }] }),
  ).not.toThrow();
  const unlocked = { ...before, bodies: [{ ...part, locked: false }] };
  expect(() => assertHolds(before, unlocked)).not.toThrow();
  expect(() =>
    assertHolds(before, { ...before, bodies: [{ ...part, locked: false, color: '#123456' }] }),
  ).toThrow('Hold');
  expect(() =>
    assertHolds(unlocked, { ...unlocked, bodies: [{ ...unlocked.bodies[0], color: '#123456' }] }),
  ).not.toThrow();
});

it('protects inherited Hold and rejects material propagation into a held linked copy', async () => {
  const a = asComponent(makeBody()),
    b = { ...a, id: 'b', groupId: 'child' };
  const before = {
    ...freshProject(),
    bodies: [a, b],
    groups: [
      { id: 'parent', name: 'Hold', hidden: false, locked: true },
      { id: 'child', parentId: 'parent', name: 'Child', hidden: false },
    ],
  };
  expect(() => assertHolds(before, { ...before, groups: before.groups.slice(1) })).toThrow('Hold');
  expect(() =>
    assertHolds(before, {
      ...before,
      groups: [before.groups[0], { ...before.groups[1], parentId: undefined }],
    }),
  ).toThrow('Hold');
  expect(() =>
    assertHolds(before, {
      ...before,
      groups: [{ ...before.groups[0], locked: false }, before.groups[1]],
    }),
  ).not.toThrow();
  const after = await synchronizeComponents(
    before,
    { ...before, bodies: [{ ...a, color: '#123456' }, b] },
    vi.fn(),
  );
  expect(() => assertHolds(before, after)).toThrow('Hold');
});
