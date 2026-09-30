import {
  axisIndex,
  corners,
  type Axis,
  type Body,
  type Guide,
  type Vec3,
  type WorkPlane,
} from './project';
import { guidePoints, planeAxes } from './guides';
import type { BodyMesh } from '../cad/protocol';
export interface Snap {
  point: Vec3;
  label: string;
  key: string;
  line?: [Vec3, Vec3];
}
export interface ReferencePoint {
  point: Vec3;
  label: string;
  key: string;
}
interface Options {
  plane?: WorkPlane;
  meshes?: BodyMesh[];
  guides?: Guide[];
  reference?: ReferencePoint;
  inferenceOrigin?: Vec3;
  forceDirection?: boolean;
  excludeId?: string;
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
export function modelSnapPoints(bodies: Body[], meshes?: BodyMesh[]): ReferencePoint[] {
  return bodies.flatMap((body) => {
    const mesh = meshes?.find((m) => m.id === body.id);
    const points: ReferencePoint[] = mesh
      ? mesh.verticesCAD.map((v) => ({
          point: v.point,
          label: 'Verteksi',
          key: `${body.id}:${v.anchor.key}`,
        }))
      : body.feature.type === 'rectangle-extrusion'
        ? corners(body).map((point, i) => ({
            point,
            label: 'Kulmapiste',
            key: `${body.id}:corner:${i}`,
          }))
        : [];
    if (mesh)
      mesh.midpointsCAD.forEach((point, i) =>
        points.push({ point, label: 'Reunan keskipiste', key: `${body.id}:mid:${i}` }),
      );
    else if (body.feature.type === 'rectangle-extrusion') {
      const pts = corners(body);
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4]) {
          const j = i ^ bit;
          if (j > i)
            points.push({
              point: pts[i].map((v, k) => (v + pts[j][k]) / 2) as Vec3,
              label: 'Keskipiste',
              key: `${body.id}:mid:${i}:${j}`,
            });
        }
    }
    points.push({
      point: body.origin.map(
        (v, i) => v + [body.feature.width, body.feature.depth, body.feature.height][i] / 2,
      ) as Vec3,
      label: 'Kappaleen keskipiste',
      key: `${body.id}:center`,
    });
    return points;
  });
}
export function snapPoint(
  raw: Vec3,
  bodies: Body[],
  threshold: number,
  previous?: Snap,
  axis?: Axis,
  anchor?: Vec3,
  grid = true,
  options: Options = {},
): Snap {
  const [u, v, normal] = planeAxes[options.plane ?? 'XY'];
  let point = [...raw] as Vec3;
  if (axis && anchor) point = point.map((n, i) => (i === axisIndex[axis] ? n : anchor[i])) as Vec3;
  const candidates: (Snap & { priority: number })[] = [
    { point: [0, 0, 0], label: 'Origo', key: 'origin', priority: 0 },
    ...modelSnapPoints(
      bodies.filter((b) => b.id !== options.excludeId),
      options.meshes,
    ).map((p) => ({ ...p, priority: 0 })),
  ];
  for (const guide of options.guides ?? []) {
    if (guide.mode !== 'guide') continue;
    const pts = guidePoints(bodies, guide);
    if (!pts) continue;
    const [a, b] = pts,
      delta = b.map((n, i) => n - a[i]),
      length2 = delta.reduce((s, n) => s + n * n, 0);
    if (
      length2 < 1e-8 ||
      Math.abs(a[normal] - point[normal]) > 1e-5 ||
      Math.abs(b[normal] - point[normal]) > 1e-5
    )
      continue;
    const t = point.reduce((s, n, i) => s + (n - a[i]) * delta[i], 0) / length2;
    const projected = a.map((n, i) => n + t * delta[i]) as Vec3;
    candidates.push(
      { point: a, label: 'Apuviivan alku', key: `${guide.id}:start`, priority: 0 },
      { point: b, label: 'Apuviivan pää', key: `${guide.id}:end`, priority: 0 },
      { point: projected, label: 'Apuviiva', key: `${guide.id}:line`, line: pts, priority: 1 },
    );
  }
  const reference = options.reference;
  if (reference) {
    const projected = [...reference.point] as Vec3;
    projected[normal] = point[normal];
    for (const i of [u, v]) {
      const candidate = [...point] as Vec3;
      candidate[i] = projected[i];
      candidates.push({
        point: candidate,
        label: `Viite · ${reference.label}`,
        key: `reference:${reference.key}:${i}`,
        line: [projected, candidate],
        priority: 1,
      });
    }
    candidates.push({
      point: projected,
      label: 'Viitepiste',
      key: `reference:${reference.key}`,
      priority: 0,
    });
  }
  if (options.inferenceOrigin && !axis) {
    const start = options.inferenceOrigin,
      dx = point[u] - start[u],
      dy = point[v] - start[v];
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const direction = [0, 0, 0] as Vec3;
    direction[u] = Math.cos(angle);
    direction[v] = Math.sin(angle);
    const along = dx * direction[u] + dy * direction[v];
    const projected = start.map((n, i) => n + direction[i] * along) as Vec3;
    if (options.forceDirection) point = projected;
    candidates.push({
      point: projected,
      label: `Suunta ${Math.round((angle * 180) / Math.PI)}°`,
      key: `direction:${angle}`,
      line: [start, projected],
      priority: 2,
    });
  }
  const eligible = candidates.filter((c) => {
    if (options.forceDirection && options.inferenceOrigin && !axis) {
      const start = options.inferenceOrigin,
        du = point[u] - start[u],
        dv = point[v] - start[v];
      if (
        Math.abs((c.point[u] - start[u]) * dv - (c.point[v] - start[v]) * du) >
        1e-5 * Math.max(1, Math.hypot(du, dv))
      )
        return false;
    }
    return axis && anchor
      ? c.point.every((n, i) => i === axisIndex[axis] || Math.abs(n - anchor[i]) < 1e-5)
      : Math.abs(c.point[normal] - point[normal]) < 1e-5;
  });
  const stable =
    previous &&
    eligible.find((c) => c.key === previous.key && distance(c.point, point) < threshold * 1.5);
  if (stable) return stable;
  const closest = eligible
    .filter((c) => distance(c.point, point) < threshold)
    .sort(
      (a, b) => a.priority - b.priority || distance(a.point, point) - distance(b.point, point),
    )[0];
  if (closest) return closest;
  if (grid && !options.forceDirection)
    return {
      point: point.map((n, i) =>
        (!axis ? i !== normal : i === axisIndex[axis]) ? Math.round(n / 10) * 10 : n,
      ) as Vec3,
      label: 'Ruudukko · 10 mm',
      key: 'grid',
    };
  return { point, label: axis ? `${axis.toUpperCase()}-akseli` : 'Vapaa', key: 'free' };
}
