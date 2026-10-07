import type { Vec3, Axis } from './project';
import { dot, sub, unit } from './geometry';

/** Orient a line constraint along the pointer's travel, not the positive world axis. */
export function penTravelDirection(
  start: Vec3,
  point: Vec3,
  constraint?: Vec3,
  previous?: Vec3,
): Vec3 | undefined {
  const delta = sub(point, start);
  if (!constraint) return Math.hypot(...delta) > 1e-8 ? unit(delta) : previous;
  const direction = unit(constraint);
  const distance = dot(delta, direction);
  const sign = Math.abs(distance) > 1e-8 ? distance : previous ? dot(previous, direction) : 1;
  return direction.map((value) => value * (sign < 0 ? -1 : 1)) as Vec3;
}

export function penPointAtLength(start: Vec3, direction: Vec3 | undefined, length: number): Vec3 {
  if (!direction) throw new Error('Osoita ensin viivan suunta ja kirjoita sitten pituus.');
  return start.map((value, i) => value + direction[i] * length) as Vec3;
}

/** A soft angular preference; never a persistent constraint or an off-plane projection. */
export function penAxisHint(
  start: Vec3,
  raw: Vec3,
  normal: Vec3,
  degrees = 5,
): { point: Vec3; axis: Axis } | undefined {
  const delta = sub(raw, start),
    length = Math.hypot(...delta);
  if (length < 1e-8) return;
  const index = delta.map(Math.abs).indexOf(Math.max(...delta.map(Math.abs)));
  if (
    Math.abs(normal[index]) > 1e-6 ||
    (Math.acos(Math.min(1, Math.abs(delta[index]) / length)) * 180) / Math.PI > degrees + 1e-8
  )
    return;
  const point = [...start] as Vec3;
  point[index] = raw[index];
  return { point, axis: (['x', 'y', 'z'] as const)[index] };
}
