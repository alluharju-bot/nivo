import { expect, it, vi } from 'vitest';
import { colorPreviewTargets } from './colorPreview';
import { asComponent, synchronizeComponents } from './components';
import { freshProject, makeBody } from './project';

it('previews exactly the copies a shared color commit changes, including local UVs and excluding local materials', async () => {
  const a = asComponent(makeBody());
  const bodies = [
    a,
    { ...a, id: 'shared' },
    { ...a, id: 'uv', localTexture: true },
    { ...a, id: 'local', localMaterial: true },
    makeBody(),
  ];
  const project = { ...freshProject(), bodies };
  for (const ids of [[a.id], ['uv'], ['local'], [a.id, 'local']]) {
    const changed = await synchronizeComponents(
      project,
      {
        ...project,
        bodies: bodies.map((b) => (ids.includes(b.id) ? { ...b, color: '#112233' } : b)),
      },
      vi.fn(),
    );
    expect(colorPreviewTargets(bodies, [], ids)).toEqual(
      changed.bodies.filter((b) => b.color === '#112233').map((b) => b.id),
    );
  }
});

it('does not preview an edit that would change a held linked copy or a held group', () => {
  const a = asComponent(makeBody());
  expect(colorPreviewTargets([a, { ...a, id: 'held', locked: true }], [], [a.id])).toEqual([]);
  expect(
    colorPreviewTargets(
      [{ ...a, groupId: 'held' }],
      [{ id: 'held', name: 'Hold', hidden: false, locked: true }],
      [a.id],
    ),
  ).toEqual([]);
});
