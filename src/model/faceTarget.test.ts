import { expect, it } from 'vitest';
import type { BodyMesh, FaceTarget } from '../cad/protocol';
import { toolFaceTarget } from './faceTarget';

const mesh = {
  id: 'part',
  faces: [
    { ref: 'z:max', center: [50, 50, 40], normal: [0, 0, 1], planar: true },
    { ref: 'y:min', center: [50, 0, 20], normal: [0, -1, 0], planar: true },
  ],
} as BodyMesh;
const hovered: FaceTarget = {
  bodyId: 'part',
  face: 'y:min',
  point: [80, 0, 30],
  normal: [0, -1, 0],
};

it('keeps the selected face and its own normal and point when another face or body is hovered', () => {
  const selected = { bodyId: 'part', face: 'z:max' as const };
  for (const hover of [hovered, { ...hovered, bodyId: 'other' }, undefined])
    expect(toolFaceTarget([mesh], selected, hover, undefined)).toEqual({
      ...selected,
      point: [50, 50, 40],
      normal: [0, 0, 1],
    });
  expect(toolFaceTarget([mesh], { bodyId: 'part', face: 'y:min' }, hovered, undefined)).toEqual(
    hovered,
  );
});

it('preserves direct hover and object-only shortcuts without inventing a target for stale selection', () => {
  expect(toolFaceTarget([mesh], undefined, hovered, { bodyId: 'part' })).toEqual(hovered);
  expect(toolFaceTarget([mesh], undefined, undefined, { bodyId: 'part' })?.face).toBe('z:max');
  expect(
    toolFaceTarget([mesh], { bodyId: 'part', face: 'surface:99' }, hovered, undefined),
  ).toBeUndefined();
  expect(
    toolFaceTarget([mesh], { bodyId: 'gone', face: 'z:max' }, hovered, undefined),
  ).toBeUndefined();
});
