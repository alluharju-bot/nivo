export type StrokePoint = [number, number];

/** Remove redundant pointer samples while retaining corners within the visible tolerance. */
export function simplifyStroke(points: StrokePoint[], tolerance = 0.75): StrokePoint[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const a = points[start],
      b = points[end],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length2 = dx * dx + dy * dy;
    let far = -1,
      distance = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const p = points[i],
        t = length2
          ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2))
          : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > distance) {
        far = i;
        distance = d;
      }
    }
    if (far >= 0) {
      keep.add(far);
      pending.push([start, far], [far, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}
