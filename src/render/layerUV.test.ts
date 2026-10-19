import { expect, it } from 'vitest';
import * as THREE from 'three';
import { makeBody } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { materialUV } from './materials';
import { cylindricalUV, layerUVKey } from './layerUV';
import { canUpdateSurfaces } from './sceneChanges';

it('gives all sides of a cylinder distinct UVs and splits only rendering vertices at the seam', () => {
  const mapping = {
    kind: 'cylinder' as const,
    origin: [0, 0, 0] as [number, number, number],
    axis: [0, 1, 0] as [number, number, number],
    uAxis: [1, 0, 0] as [number, number, number],
    radius: 10,
  };
  const uv = [
    new THREE.Vector3(10, 3, 0),
    new THREE.Vector3(0, 3, 10),
    new THREE.Vector3(-10, 3, 0),
    new THREE.Vector3(0, 3, -10),
  ].map((p) => cylindricalUV(mapping, p));
  expect(new Set(uv.map((p) => p[0])).size).toBe(4);
  expect(uv.every((p) => p[1] === 3)).toBe(true);
  const geometry = new THREE.CylinderGeometry(10, 10, 20, 16, 1);
  const count = geometry.index!.count;
  const original = geometry.clone();
  const plain = makeBody();
  const body = {
    ...plain,
    faceMaterials: {
      0: {
        color: '#ffffff',
        appearance: { ...defaultAppearance('iron-black'), surfaceMapping: mapping },
      },
    },
  };
  materialUV(geometry, body, [{ ...geometry.groups[0], index: 0 }]);
  expect(geometry.index!.count).toBe(count);
  for (let i = 0; i < count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(
      geometry.getAttribute('position'),
      geometry.index!.getX(i),
    );
    const q = new THREE.Vector3().fromBufferAttribute(
      original.getAttribute('position'),
      original.index!.getX(i),
    );
    expect(p.distanceTo(q)).toBe(0);
  }
  for (let i = 0; i < geometry.groups[0].count; i += 3) {
    const us = [0, 1, 2].map((k) => geometry.getAttribute('uv').getX(geometry.index!.getX(i + k)));
    expect(Math.max(...us) - Math.min(...us)).toBeLessThan(Math.PI * 10);
  }
  expect(layerUVKey(plain)).not.toBe(layerUVKey(body));
  expect(canUpdateSurfaces({ bodies: [plain], meshes: [] }, { bodies: [body], meshes: [] })).toBe(
    false,
  );
  const changed = { ...body, color: '#333333' };
  expect(canUpdateSurfaces({ bodies: [body], meshes: [] }, { bodies: [changed], meshes: [] })).toBe(
    true,
  );
  original.dispose();
  geometry.dispose();
});
