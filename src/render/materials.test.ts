import { expect, it } from 'vitest';
import * as THREE from 'three';
import { texturePlacement, textureFrameMatrix } from './materials';
import { defaultAppearance, materialPresets } from '../model/materials';
import { makeBody, freshProject, parseProject } from '../model/project';
import { snapOnSketchPlane, snapPoint } from '../model/snap';
import { sketchFrame } from '../model/sketch';

it('keeps millimeter offsets independent of rotation and per-object texture scale', () => {
  const a = new THREE.Texture(),
    b = new THREE.Texture(),
    placement = {
      width: 80,
      height: 160,
      offsetX: 31,
      offsetY: 47,
      rotation: 63,
      lockAspect: true,
    };
  texturePlacement(a, placement);
  texturePlacement(b, { ...placement, width: 200 });
  expect(new THREE.Vector2(31, 47).applyMatrix3(a.matrix).length()).toBeCloseTo(0, 10);
  expect(a.matrix.equals(b.matrix)).toBe(false);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3);
  const body = {
    ...makeBody(100, 80, 20, [50, 100, 20]),
    textureFrame: { offset: [3, 4, 5] as [number, number, number], rotation: q.toArray() },
  };
  const local = new THREE.Vector3(12, 36, 5),
    world = local.clone().applyMatrix4(textureFrameMatrix(body));
  expect(
    world.clone().applyMatrix4(textureFrameMatrix(body).invert()).distanceTo(local),
  ).toBeLessThan(1e-10);
  const moved = { ...body, origin: [150, 300, 20] as [number, number, number] };
  expect(
    world
      .add(new THREE.Vector3(100, 200, 0))
      .applyMatrix4(textureFrameMatrix(moved).invert())
      .distanceTo(local),
  ).toBeLessThan(1e-10);
  a.dispose();
  b.dispose();
});
it('ships 27 distinct presets and rejects a missing imported image', () => {
  expect(materialPresets).toHaveLength(27);
  expect(new Set(materialPresets.map((p) => p.id)).size).toBe(27);
  expect(
    new Set(materialPresets.filter((p) => p.category === 'Massiivipuut').map((p) => p.pattern))
      .size,
  ).toBe(4);
  expect(
    new Set(materialPresets.filter((p) => p.category === 'Kivet').map((p) => p.pattern)).size,
  ).toBe(4);
  expect(() =>
    parseProject(
      JSON.stringify({
        ...freshProject(),
        bodies: [
          { ...makeBody(), appearance: { ...defaultAppearance('paint'), assetId: 'missing' } },
        ],
      }),
    ),
  ).toThrow();
});
it('uses configurable grid spacing while keeping geometric targets exact', () => {
  const body = makeBody(80, 50, 20, [257.375, 143.625, 0]);
  expect(
    snapPoint([73, 29, 0], [], 0.1, undefined, undefined, undefined, true, { gridStep: 25 }).point,
  ).toEqual([75, 25, 0]);
  expect(
    snapOnSketchPlane(
      [73, 29, 0],
      sketchFrame([0, 0, 0]),
      [],
      [],
      [],
      0.1,
      true,
      undefined,
      undefined,
      [],
      25,
    ).point,
  ).toEqual([75, 25, 0]);
  expect(
    snapPoint([257, 144, 0], [body], 5, undefined, undefined, undefined, true, { gridStep: 25 })
      .point,
  ).toEqual(body.origin);
});
