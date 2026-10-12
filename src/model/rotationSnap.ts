import type { Vec3 } from './project';
import { dot, sub, scale, unit } from './geometry';
import { cross } from './transforms';

/** Reference points may lie outside the rotation plane. Only their direction
 * in that plane controls the angle; rotation never changes the source radius. */
export function rotationDirection(point: Vec3, pivot: Vec3, axis: Vec3): Vec3 | undefined {
  const delta = sub(point, pivot),
    normal = unit(axis);
  const projected = sub(delta, scale(normal, dot(delta, normal)));
  return Math.hypot(...projected) > 1e-6 ? unit(projected) : undefined;
}

export function rotationReferenceAngle(reference: Vec3, direction: Vec3, axis: Vec3) {
  return (
    (Math.atan2(dot(unit(axis), cross(reference, direction)), dot(reference, direction)) * 180) /
    Math.PI
  );
}

/** Five-degree detents with a wider catch around the main quarter turns. */
export function rotationAngle(angle: number, free = false): number {
  if (free) return Math.round(angle * 100) / 100;
  const cardinal = Math.round(angle / 90) * 90;
  return Math.abs(angle - cardinal) <= 4 ? cardinal : Math.round(angle / 5) * 5;
}
