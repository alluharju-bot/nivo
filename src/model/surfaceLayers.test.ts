import { expect, it } from 'vitest';
import { freshProject, makeBody, parseProject } from './project';
import { defaultAppearance } from './materials';
import { changeSurfaceLayers, newSurfaceLayer } from './surfaceLayers';
import { synchronizeComponents } from './components';
import { assertHolds } from './holds';
it('keeps base and independent face finishes, restores every map after removing layers', () => {
  const body = {
    ...makeBody(),
    appearance: defaultAppearance('chrome'),
    faceMaterials: { 2: { color: '#eeeeee', appearance: defaultAppearance('oak') } },
  };
  const layer = newSurfaceLayer('dust');
  const changed = changeSurfaceLayers(body, (l) => [...l, layer]);
  expect(changed.appearance?.preset).toBe('chrome');
  expect(changed.faceMaterials![2].appearance.preset).toBe('oak');
  expect(changed.faceMaterials![2].appearance.layers).toEqual([layer]);
  expect(changeSurfaceLayers(changed, () => [])).toEqual(body);
  const local = changeSurfaceLayers(body, (l) => [...l, { ...layer, center: [10, 20] }], 2);
  expect(local.appearance).toEqual(body.appearance);
  expect(local.faceMaterials![2].appearance.layers![0].center).toEqual([10, 20]);
  expect(parseProject(JSON.stringify({ ...freshProject(), bodies: [local] })).bodies[0]).toEqual(
    local,
  );
});
it('shares overlays with linked copies and protects held instances', async () => {
  const a = {
    ...makeBody(),
    component: {
      id: 'family',
      offset: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    },
  };
  const b = { ...a, id: 'copy', origin: [1000, 0, 0] as [number, number, number] };
  const project = { ...freshProject(), bodies: [a, b] };
  const changed = changeSurfaceLayers(a, (l) => [...l, newSurfaceLayer('scratches')]);
  const result = await synchronizeComponents(
    project,
    { ...project, bodies: [changed, b] },
    async () => {
      throw new Error('Material changes must not rebuild geometry');
    },
  );
  expect(result.bodies[1].appearance?.layers).toEqual(changed.appearance?.layers);
  expect(() => assertHolds({ ...project, bodies: [a, { ...b, locked: true }] }, result)).toThrow(
    /Hold/,
  );
});
