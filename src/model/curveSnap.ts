import type { CadEdge } from '../cad/protocol';
import type { Vec3 } from './project';
import { add, sub, dot, scale, unit } from './geometry';

/** Correct a chord hit back onto the exact circle, without quantizing its height. */
export function onCurve(point: Vec3, edge: CadEdge): Vec3 {
  if (!edge.circle) return point;
  const { center, normal, radius } = edge.circle;
  const delta = sub(point, center);
  const radial = sub(delta, scale(normal, dot(delta, normal)));
  return Math.hypot(...radial) < 1e-10 ? edge.start : add(center, scale(unit(radial), radius));
}

/** Infinite line / exact circular arc. The tessellated segment only bounds the arc. */
export function circleLineIntersections(points: [Vec3, Vec3], edge: CadEdge): Vec3[] {
  if (!edge.circle) return [];
  const { center, normal, radius } = edge.circle;
  const a = sub(points[0], center),
    d = sub(points[1], points[0]),
    length2 = dot(d, d);
  if (length2 < 1e-16) return [];
  const height = dot(a, normal),
    slope = dot(d, normal);
  let hits: Vec3[];
  if (Math.abs(slope) > Math.sqrt(length2) * 1e-10) {
    const p = add(points[0], scale(d, -height / slope));
    hits = Math.abs(Math.hypot(...sub(p, center)) - radius) < 1e-6 ? [p] : [];
  } else {
    if (Math.abs(height) > 1e-6) return [];
    const b = dot(a, d),
      discriminant = b * b - length2 * (dot(a, a) - radius * radius);
    if (discriminant < -1e-7) return [];
    const root = Math.sqrt(Math.max(0, discriminant));
    hits = [-b - root, -b + root].map((t) => add(points[0], scale(d, t / length2)));
  }
  const middle = unit(sub(scale(add(edge.start, edge.end), 0.5), center));
  const limit = dot(unit(sub(edge.start, center)), middle) - 1e-9;
  return hits.filter((p) => dot(unit(sub(p, center)), middle) >= limit);
}
