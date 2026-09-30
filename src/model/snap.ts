import { axisIndex, corners, type Axis, type Body, type Vec3 } from './project';

export interface Snap {
  point: Vec3;
  label: string;
  key: string;
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
export function snapPoint(
  raw: Vec3,
  bodies: Body[],
  threshold: number,
  previous?: Snap,
  axis?: Axis,
  anchor?: Vec3,
  grid = true,
): Snap {
  let point = [...raw] as Vec3;
  if (axis && anchor) point = point.map((n, i) => (i === axisIndex[axis] ? n : anchor[i])) as Vec3;
  const candidates: Snap[] = [{ point: [0, 0, 0], label: 'Origo', key: 'origin' }];
  for (const body of bodies) {
    const pts = corners(body);
    pts.forEach((p, i) =>
      candidates.push({ point: p, label: 'Kulmapiste', key: `${body.id}:corner:${i}` }),
    );
    // All 12 true edge midpoints, not triangle-edge midpoints.
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4]) {
        const j = i ^ bit;
        if (j > i)
          candidates.push({
            point: pts[i].map((n, k) => (n + pts[j][k]) / 2) as Vec3,
            label: 'Keskipiste',
            key: `${body.id}:edge:${i}:${j}`,
          });
      }
  }
  const eligible = candidates.filter((c) =>
    axis && anchor
      ? c.point.every((n, i) => i === axisIndex[axis] || Math.abs(n - anchor[i]) < 0.001)
      : Math.abs(c.point[2] - point[2]) < 0.001,
  );
  const stable =
    previous &&
    eligible.find((c) => c.key === previous.key && distance(c.point, point) < threshold * 1.5);
  if (stable) return stable;
  const closest = eligible
    .filter((c) => distance(c.point, point) < threshold)
    .sort((a, b) => distance(a.point, point) - distance(b.point, point))[0];
  if (closest) return closest;
  if (grid)
    return {
      point: point.map((n, i) =>
        (!axis ? i < 2 : i === axisIndex[axis]) ? Math.round(n / 10) * 10 : n,
      ) as Vec3,
      label: 'Ruudukko · 10 mm',
      key: 'grid',
    };
  return { point, label: axis ? `${axis.toUpperCase()}-akseli` : 'Vapaa', key: 'free' };
}
