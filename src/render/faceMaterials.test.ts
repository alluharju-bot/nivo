import { expect, it } from 'vitest';
import { BoxGeometry, MeshPhysicalMaterial } from 'three';
import { makeBody } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { paintSurface } from '../model/faceMaterials';
import { renderFaceMaterials } from './faceMaterials';
import { canUpdateSurfaces } from './sceneChanges';
import type { BodyMesh } from '../cad/protocol';

it('material groups cover every triangle once; repainting preserves the geometry fast path', () => {
  const geometry = new BoxGeometry(),
    index = geometry.index!;
  const mesh = {
    id: 'part',
    triangles: [...index.array],
    vertices: [...geometry.attributes.position.array],
    normals: [...geometry.attributes.normal.array],
    faces: geometry.groups.map((g, i) => ({
      index: i,
      ref: `surface:${i}`,
      start: g.start,
      count: g.count,
    })),
  } as BodyMesh;
  const plain = { ...makeBody(), id: 'part' },
    painted = paintSurface(plain, defaultAppearance('oak'), '#884400', 2);
  const materials = renderFaceMaterials(
    geometry,
    painted,
    mesh,
    (source) => new MeshPhysicalMaterial({ color: source.color }),
  );
  expect(geometry.groups).toHaveLength(3);
  expect(
    geometry.groups.flatMap((g) => Array.from({ length: g.count }, (_, i) => i + g.start)),
  ).toEqual(Array.from({ length: index.count }, (_, i) => i));
  expect(materials[1].color.getHexString()).toBe('884400');
  expect(materials[0].color.getHexString()).toBe(plain.color.slice(1));
  const before = { bodies: [painted], meshes: [mesh] };
  const next = (preset: string) => ({
    bodies: [paintSurface(painted, defaultAppearance(preset), '#abcdef', 2)],
    meshes: [mesh],
  });
  expect(canUpdateSurfaces(before, next('walnut'))).toBe(true);
  expect(canUpdateSurfaces(before, next('led-warm'))).toBe(false);
  expect(canUpdateSurfaces(before, next('mirror'))).toBe(false);
  for (const material of materials) material.dispose();
  geometry.dispose();
});
