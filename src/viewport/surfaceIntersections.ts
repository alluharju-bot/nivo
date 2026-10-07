import { Box3, Vector3 } from 'three';
import type { BodyMesh, CadFace } from '../cad/protocol';
import type { Vec3 } from '../model/project';

export interface SurfaceIntersection {
  start: Vec3;
  end: Vec3;
  faces: [CadFace, CadFace];
}
const epsilon = 1e-5;
type Interval = [number, number];

/** Clip an infinite plane-plane line to the actual triangles, including concave faces and holes. */
function faceIntervals(
  mesh: BodyMesh,
  face: CadFace,
  origin: Vector3,
  direction: Vector3,
): Interval[] {
  const intervals: Interval[] = [];
  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  const normal = new Vector3(),
    edge = new Vector3(),
    inward = new Vector3(),
    offset = new Vector3();
  for (let i = face.start; i < face.start + face.count; i += 3) {
    vertices.forEach((v, j) => v.fromArray(mesh.vertices, mesh.triangles[i + j] * 3));
    normal
      .crossVectors(
        edge.subVectors(vertices[1], vertices[0]),
        offset.subVectors(vertices[2], vertices[0]),
      )
      .normalize();
    if (normal.lengthSq() < 0.5) continue;
    let low = -Infinity,
      high = Infinity;
    for (let j = 0; j < 3; j++) {
      edge.subVectors(vertices[(j + 1) % 3], vertices[j]);
      inward.crossVectors(normal, edge).normalize();
      const at = inward.dot(offset.subVectors(origin, vertices[j])),
        along = inward.dot(direction);
      if (Math.abs(along) < 1e-12) {
        if (at < -epsilon) {
          low = Infinity;
          break;
        }
      } else if (along > 0) low = Math.max(low, -at / along);
      else high = Math.min(high, -at / along);
    }
    if (Number.isFinite(low) && Number.isFinite(high) && high >= low - epsilon)
      intervals.push([low, high]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + epsilon)
      previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

const meshBounds = new WeakMap<BodyMesh, Box3>();
function box(mesh: BodyMesh) {
  let value = meshBounds.get(mesh);
  if (!value) {
    value = new Box3();
    const p = new Vector3();
    for (let i = 0; i < mesh.vertices.length; i += 3)
      value.expandByPoint(p.fromArray(mesh.vertices, i));
    value.expandByScalar(epsilon);
    meshBounds.set(mesh, value);
  }
  return value;
}
const cache = new WeakMap<BodyMesh, WeakMap<BodyMesh, SurfaceIntersection[]>>();

/** Reference geometry only: never splits a solid or changes its CAD topology. Mesh identity invalidates the cache. */
export function surfaceIntersections(a: BodyMesh, b: BodyMesh): SurfaceIntersection[] {
  let pairs = cache.get(a);
  if (!pairs) {
    pairs = new WeakMap();
    cache.set(a, pairs);
  }
  const cached = pairs.get(b);
  if (cached) return cached;
  const result: SurfaceIntersection[] = [];
  pairs.set(b, result);
  if (!box(a).intersectsBox(box(b))) return result;
  for (const first of a.faces)
    for (const second of b.faces) {
      if (!first.planar || !second.planar) continue;
      const n1 = new Vector3(...first.normal),
        n2 = new Vector3(...second.normal);
      const direction = n1.clone().cross(n2);
      if (direction.lengthSq() < 1e-10) continue;
      direction.normalize();
      const toward = n2.clone().addScaledVector(n1, -n1.dot(n2));
      const origin = new Vector3(...first.center);
      origin.addScaledVector(
        toward,
        n2.dot(new Vector3(...second.center).sub(origin)) / toward.lengthSq(),
      );
      const left = faceIntervals(a, first, origin, direction),
        right = faceIntervals(b, second, origin, direction);
      let i = 0,
        j = 0;
      while (i < left.length && j < right.length) {
        const low = Math.max(left[i][0], right[j][0]),
          high = Math.min(left[i][1], right[j][1]);
        if (high - low > epsilon)
          result.push({
            start: origin.clone().addScaledVector(direction, low).toArray() as Vec3,
            end: origin.clone().addScaledVector(direction, high).toArray() as Vec3,
            faces: [first, second],
          });
        if (left[i][1] < right[j][1]) i++;
        else j++;
      }
    }
  return result;
}
