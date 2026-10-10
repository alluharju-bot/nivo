import { expect, it } from 'vitest';
import type { BodyMesh } from '../cad/protocol';
import { surfaceFaceRanges } from './faceRanges';

it('keeps all CAD triangles in order with at most three draws for a selected face', () => {
  const mesh = {
    triangles: Array(3000).fill(0),
    faces: Array.from({ length: 500 }, (_, i) => ({ ref: `surface:${i}`, start: i * 6, count: 6 })),
  } as BodyMesh;
  for (const i of [0, 250, 499]) {
    const ranges = surfaceFaceRanges(mesh, `surface:${i}`);
    expect(ranges.length).toBeLessThanOrEqual(3);
    expect(ranges.filter((r) => r.ref)).toEqual([mesh.faces[i]]);
    expect(ranges.flatMap((r) => Array.from({ length: r.count }, (_, j) => r.start + j))).toEqual(
      Array.from({ length: 3000 }, (_, j) => j),
    );
  }
  expect(surfaceFaceRanges(mesh)).toEqual([{ ref: undefined, start: 0, count: 3000 }]);
  expect(surfaceFaceRanges(mesh, 'surface:9999')).toHaveLength(1);
  expect(surfaceFaceRanges(mesh, 'surface:250', true)).toBe(mesh.faces);
});
