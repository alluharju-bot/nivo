import { expect, it } from 'vitest';
import { BoxGeometry, MeshPhysicalMaterial } from 'three';
import { makeBody } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { paintSurface } from '../model/faceMaterials';
import { partEmitterGroups, renderFaceMaterials } from './faceMaterials';
import { createPartLights } from './lights';
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

it('painting a spotlight housing does not duplicate or shift its light source', () => {
  const geometry = new BoxGeometry(80, 80, 10),
    index = geometry.index!;
  const data = {
    id: 'spot',
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
  const body = {
    ...makeBody(80, 80, 10),
    appearance: {
      ...defaultAppearance('matte'),
      emission: {
        enabled: true,
        type: 'spot' as const,
        color: '#ffffff',
        intensity: 12,
        angle: 36,
        direction: '-z' as const,
      },
    },
  };
  // A different finish in the middle splits the remaining base draw range.
  const painted = paintSurface(body, defaultAppearance('aluminum-anodized-black'), '#222222', 2);
  const groups = partEmitterGroups(geometry, painted, data);
  expect(groups).toHaveLength(1);
  const emitter = geometry.clone();
  emitter.setIndex(groups[0].indices);
  // emitterFrame reads the supplied compact positions as scene.ts does.
  const compact = emitter.toNonIndexed();
  const light = createPartLights(groups[0].source, compact).children[0];
  expect(light.position.toArray()).toEqual([0, 0, -5.1]);
  const withFaceSpot = paintSurface(painted, body.appearance, '#ffffff', 4);
  expect(partEmitterGroups(geometry, withFaceSpot, data)).toHaveLength(2);
  compact.dispose();
  emitter.dispose();
  geometry.dispose();
});
