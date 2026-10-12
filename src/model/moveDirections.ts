import type { BodyMesh } from '../cad/protocol';
import type { Axis, Vec3 } from './project';
import { add, dot, scale, sub, unit } from './geometry';
import { cross } from './transforms';

const world: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const canonical = (v: Vec3): Vec3 => {
  const direction = unit(v);
  return (direction.find((n) => Math.abs(n) > 1e-6) ?? 1) < 0 ? scale(direction, -1) : direction;
};
export function worldAxis(direction: Vec3): Axis | undefined {
  const index = direction.findIndex((n) => Math.abs(n) > 1 - 1e-8);
  return index < 0 ? undefined : (['x', 'y', 'z'] as const)[index];
}

const cache = new WeakMap<BodyMesh, Vec3[]>();
/** One stable frame per source mesh, including parts rotated or edited in CAD.
 * Do not scan dense geometry on every pointer move or use its world bounding box. */
export function moveDirections(mesh?: BodyMesh): Vec3[] {
  if (!mesh) return world;
  const cached = cache.get(mesh);
  if (cached) return cached;
  let first: Vec3 | undefined,
    longest = 0;
  for (const edge of mesh.edgesCAD) {
    if (edge.circle) continue;
    const delta = sub(edge.end, edge.start),
      length = Math.hypot(...delta);
    if (length > longest + 1e-6) {
      first = canonical(delta);
      longest = length;
    }
  }
  if (!first || longest < 1e-6) return world;
  let second: Vec3 | undefined;
  longest = 0;
  for (const edge of mesh.edgesCAD) {
    if (edge.circle) continue;
    const delta = sub(edge.end, edge.start),
      length = Math.hypot(...delta);
    if (length > longest + 1e-6 && Math.abs(dot(unit(delta), first)) < 1e-6) {
      second = canonical(delta);
      longest = length;
    }
  }
  // A flat or irregular profile may have no perpendicular straight edge.
  const fallback =
    mesh.faces.find((face) => face.planar && Math.abs(dot(face.normal, first!)) < 1e-6)?.normal ??
    [...world].sort((a, b) => Math.abs(dot(a, first!)) - Math.abs(dot(b, first!)))[0];
  second ??= canonical(sub(fallback, scale(first, dot(fallback, first))));
  const directions = [first, second, canonical(cross(first, second))];
  cache.set(mesh, directions);
  return directions;
}

/** Quantize travel along the constraint, never each world coordinate separately. */
export function moveGridPoint(start: Vec3, point: Vec3, step: number, direction?: Vec3): Vec3 {
  const delta = sub(point, start);
  return add(
    start,
    direction
      ? scale(unit(direction), Math.round(dot(delta, unit(direction)) / step) * step)
      : (delta.map((n) => Math.round(n / step) * step) as Vec3),
  );
}
