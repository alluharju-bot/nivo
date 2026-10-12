import { expect, it } from 'vitest';
import type { BodyMesh } from '../cad/protocol';
import { makeBody, type Vec3 } from './project';
import { createRotationGripResolver, defaultRotationGrip } from './rotationGrip';
import { rotatePoint, type Rotation } from './transforms';

const body = makeBody(200, 40, 80);
function boxMesh(transform: (point: Vec3) => Vec3 = (p) => p): BodyMesh {
  const points: Vec3[] = Array.from({ length: 8 }, (_, i) =>
    transform([i & 1 ? 200 : 0, i & 2 ? 40 : 0, i & 4 ? 80 : 0]),
  );
  return {
    id: body.id,
    vertices: points.flat(),
    normals: [],
    triangles: [],
    edges: [],
    faces: [],
    volume: 640000,
    verticesCAD: [],
    midpointsCAD: [],
    boundaries: [],
    edgesCAD: points.flatMap((start, i) =>
      [0, 1, 2]
        .filter((j) => !(i & (1 << j)))
        .map((j) => ({
          start,
          end: points[i | (1 << j)],
          from: { bodyId: body.id, key: `v${i}`, local: start },
          to: { bodyId: body.id, key: `v${i | (1 << j)}`, local: points[i | (1 << j)] },
        })),
    ),
  };
}
const rotation = (pivot: Vec3, axis: Vec3 = [0, 1, 0]): Rotation => ({
  ids: [body.id],
  pivot,
  axis,
  angle: 0,
});
it('follows the same long edge from every box corner, rather than its center or diagonal', () => {
  const mesh = boxMesh();
  for (const x of [0, 200])
    for (const y of [0, 40])
      for (const z of [0, 80]) {
        expect(defaultRotationGrip(rotation([x, y, z]), [body], [mesh])).toEqual([200 - x, y, z]);
        expect(defaultRotationGrip(rotation([x, y, z], [1, 0, 0]), [body], [mesh])).toEqual([
          x,
          y,
          80 - z,
        ]);
      }
});
it('uses the center line at center and preserves a face/edge anchor line', () => {
  const meshes = [boxMesh()];
  expect(defaultRotationGrip(rotation([100, 20, 40]), [body], meshes)).toEqual([200, 20, 40]);
  expect(defaultRotationGrip(rotation([100, 0, 40]), [body], meshes)).toEqual([200, 0, 40]);
  expect(defaultRotationGrip(rotation([50, 0, 80]), [body], meshes)).toEqual([200, 0, 80]);
});
it('uses real rotated edges, not world bounding box corners', () => {
  const transform = (p: Vec3) => rotatePoint(p, [0, 0, 0], [0, 0, 1], 31);
  const mesh = boxMesh(transform),
    r = rotation(transform([0, 0, 80]), [0, 0, 1]);
  expect(defaultRotationGrip(r, [body], [mesh])).toEqual(transform([200, 0, 80]));
});
it('keeps explicit points and cached automatic points independent of the preview angle', () => {
  const resolve = createRotationGripResolver(),
    bodies = [body],
    meshes = [boxMesh()],
    r = rotation([0, 0, 0]),
    point = resolve(r, bodies, meshes);
  expect(resolve({ ...r, angle: 85 }, bodies, meshes)).toBe(point);
  expect(resolve({ ...r, grip: [200, 0, 80] }, bodies, meshes)).toEqual([200, 0, 80]);
  expect(resolve({ ...r, grip: [0, 40, 0] }, bodies, meshes)).toEqual([200, 0, 0]);
  expect(resolve({ ...r, pivot: [200, 0, 80] }, bodies, meshes)).toEqual([0, 0, 80]);
});
