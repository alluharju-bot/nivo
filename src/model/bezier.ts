import type { Vec3 } from './project';

/** Interpolating cubic Hermite chain: every clicked point lies on the curve.
 * Chord-length tangents prevent a short segment borrowing a long handle. */
export function throughPoints(input: Vec3[], closed = false): Vec3[] {
  const points = input.filter(
    (p, i) => !i || Math.hypot(...p.map((n, k) => n - input[i - 1][k])) > 1e-7,
  );
  if (
    closed &&
    points.length > 2 &&
    Math.hypot(...points[0].map((n, k) => n - points.at(-1)![k])) < 1e-7
  )
    points.pop();
  if (points.length < 2) return points;
  const tangent = (i: number): Vec3 => {
    const a = points[closed ? (i + points.length - 1) % points.length : Math.max(0, i - 1)];
    const b = points[closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1)];
    const length =
      Math.hypot(...points[i].map((n, k) => n - a[k])) +
      Math.hypot(...b.map((n, k) => n - points[i][k]));
    return b.map((n, k) => (n - a[k]) / length) as Vec3;
  };
  const result: Vec3[] = [points[0]];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const j = (i + 1) % points.length,
      a = points[i],
      b = points[j];
    const length = Math.hypot(...b.map((n, k) => n - a[k]));
    const ta = tangent(i),
      tb = tangent(j);
    result.push(
      a.map((n, k) => n + (ta[k] * length) / 3) as Vec3,
      b.map((n, k) => n - (tb[k] * length) / 3) as Vec3,
      b,
    );
  }
  return result;
}

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
