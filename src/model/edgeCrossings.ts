import type { CadEdge } from '../cad/protocol';
import type { Vec3 } from './project';
import { add, dot, scale, sub, unit } from './geometry';
import { cross } from './transforms';
import { circleLineIntersections } from './curveSnap';
import { guideEdgeIntersection, onSnapLine } from './snap';

/** Actual finite 3D crossings, never the overlap of two screen projections. */
export function edgeCrossings(a: CadEdge, b: CadEdge): Vec3[] {
  if (a.circle && b.circle) return circularCrossings(a, b);
  if (a.circle || b.circle) {
    const arc = a.circle ? a : b,
      line = a.circle ? b : a;
    return circleLineIntersections([line.start, line.end], arc).filter((point) =>
      onSnapLine(point, { id: '', points: [line.start, line.end], mode: 'free' }),
    );
  }
  // Cheap world-space rejection before intersecting densely tessellated edges.
  if (
    a.start.some(
      (_, k) =>
        Math.max(a.start[k], a.end[k]) < Math.min(b.start[k], b.end[k]) - 1e-5 ||
        Math.max(b.start[k], b.end[k]) < Math.min(a.start[k], a.end[k]) - 1e-5,
    )
  )
    return [];
  const point = guideEdgeIntersection({ id: '', points: [a.start, a.end], mode: 'free' }, b);
  // A shared vertex is already available, with the higher corner priority.
  return point &&
    ![a.start, a.end].some(
      (p) =>
        Math.hypot(...sub(p, point)) < 1e-6 &&
        [b.start, b.end].some((q) => Math.hypot(...sub(q, point)) < 1e-6),
    )
    ? [point]
    : [];
}

function circularCrossings(a: CadEdge, b: CadEdge): Vec3[] {
  const first = a.circle!,
    second = b.circle!;
  const delta = sub(second.center, first.center),
    axis = cross(first.normal, second.normal);
  let points: Vec3[];
  if (Math.hypot(...axis) > 1e-8) {
    // Intersection of the two circle planes; filter the resulting line/circle hits.
    const toward = sub(second.normal, scale(first.normal, dot(first.normal, second.normal)));
    const origin = add(
      first.center,
      scale(toward, dot(second.normal, delta) / dot(toward, toward)),
    );
    points = circleLineIntersections([origin, add(origin, unit(axis))], a);
  } else {
    if (Math.abs(dot(delta, first.normal)) > 1e-6) return [];
    const distance = Math.hypot(...delta),
      r = first.radius,
      s = second.radius;
    if (distance < 1e-8 || distance > r + s + 1e-6 || distance < Math.abs(r - s) - 1e-6) return [];
    const along = (r * r - s * s + distance * distance) / (2 * distance),
      height = Math.sqrt(Math.max(0, r * r - along * along)),
      direction = scale(delta, 1 / distance),
      middle = add(first.center, scale(direction, along)),
      offset = scale(cross(first.normal, direction), height);
    points = height < 1e-8 ? [middle] : [add(middle, offset), sub(middle, offset)];
  }
  const onArc = (point: Vec3, edge: CadEdge) => {
    const { center, normal, radius } = edge.circle!,
      radial = sub(point, center);
    if (Math.abs(dot(radial, normal)) > 1e-6 || Math.abs(Math.hypot(...radial) - radius) > 1e-6)
      return false;
    const middle = unit(sub(scale(add(edge.start, edge.end), 0.5), center));
    return dot(unit(radial), middle) >= dot(unit(sub(edge.start, center)), middle) - 1e-9;
  };
  return points.filter((point) => onArc(point, a) && onArc(point, b));
}
