import { expect, it } from 'vitest';
import { makeBody } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { canUpdateSurfaces, type RenderModel } from './sceneChanges';
import type { BodyMesh } from '../cad/protocol';

it('retains geometry for paint, PBR and UV edits but rebuilds moved, emitting and mirrored parts', () => {
  const body = makeBody();
  const mesh = {
    id: body.id,
    vertices: [0, 0, 0],
    normals: [0, 0, 1],
    triangles: [0, 0, 0],
  } as BodyMesh;
  const before: RenderModel = { bodies: [body], meshes: [mesh] };
  for (const patch of [
    { color: '#123456' },
    { appearance: defaultAppearance('pbr-coated_pine') },
    { name: 'Uusi nimi' },
  ])
    expect(canUpdateSurfaces(before, { ...before, bodies: [{ ...body, ...patch }] })).toBe(true);
  for (const patch of [
    { origin: [20, 0, 0] as [number, number, number] },
    { appearance: defaultAppearance('led-warm') },
    { appearance: defaultAppearance('mirror') },
  ])
    expect(canUpdateSurfaces(before, { ...before, bodies: [{ ...body, ...patch }] })).toBe(false);
  expect(
    canUpdateSurfaces(before, { ...before, meshes: [{ ...mesh, vertices: [...mesh.vertices] }] }),
  ).toBe(false);
  expect(canUpdateSurfaces(before, { ...before, bodies: [] })).toBe(false);
});
