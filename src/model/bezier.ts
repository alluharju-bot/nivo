import type { Vec3 } from './project';

/** Cubic control chains use start, handle, handle, end; subsequent spans add three points. */
export function sampleBezier(points: Vec3[], steps = 48): Vec3[] {
  if (points.length < 4) return points;
  const sampled: Vec3[] = [];
  for (let i = 0; i + 3 < points.length; i += 3) {
    for (let j = i ? 1 : 0; j <= steps; j++) {
      const t = j / steps,
        s = 1 - t;
      sampled.push(
        [0, 1, 2].map(
          (k) =>
            s * s * s * points[i][k] +
            3 * s * s * t * points[i + 1][k] +
            3 * s * t * t * points[i + 2][k] +
            t * t * t * points[i + 3][k],
        ) as Vec3,
      );
    }
  }
  return sampled;
}
export function bezierInstruction(count: number) {
  if (!count) return 'Napsauta käyrän alkupiste.';
  return [
    'Napsauta loppupiste. Enter viimeistelee valmiin käyrän.',
    'Napsauta ensimmäinen ohjauspiste.',
    'Napsauta toinen ohjauspiste.',
  ][count % 3];
}
