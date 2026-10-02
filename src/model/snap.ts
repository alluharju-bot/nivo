import {
  axisIndex,
  corners,
  type Axis,
  type Body,
  type Guide,
  type Vec3,
  type WorkPlane,
} from './project';
import { guidePoints, lineIntersection, planeAxes } from './guides';
import type { BodyMesh } from '../cad/protocol';
import { fromUV, toUV, ontoFrame, type SketchFrame } from './sketch';
import { dot, sub, projectOnLine } from './geometry';
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
export function guideSnapCandidates(
  raw: Vec3,
  lines: { id: string; points: [Vec3, Vec3] }[],
  threshold: number,
) {
  const candidates: (Snap & { priority: number })[] = [];
  const nearby = lines.filter(({ id, points }) => {
    const direction = sub(points[1], points[0]);
    if (Math.hypot(...direction) < 1e-8) return false;
    const point = projectOnLine(raw, points[0], direction);
    if (Math.hypot(...sub(point, raw)) > threshold * 1.5) return false;
    candidates.push(
      { point: points[0], key: `${id}:start`, label: 'Apuviivan alku', priority: 0 },
      { point: points[1], key: `${id}:end`, label: 'Apuviivan pää', priority: 0 },
      { point, key: `${id}:line`, label: 'Apuviiva', line: points, priority: 1 },
    );
    return true;
  });
  for (let i = 0; i < nearby.length; i++)
    for (let j = i + 1; j < nearby.length; j++) {
      const point = lineIntersection(nearby[i].points, nearby[j].points);
      if (point)
        candidates.push({
          point,
          key: `${nearby[i].id}:${nearby[j].id}:intersection`,
          label: 'Apuviivojen risteys',
          priority: 0,
        });
    }
  return candidates;
}
export function snapOnSketchPlane(
  raw: Vec3,
  frame: SketchFrame,
  bodies: Body[],
  meshes: BodyMesh[],
  guides: Guide[],
  threshold: number,
  grid: boolean,
  reference?: ReferencePoint,
  start?: Vec3,
  extra: ReferencePoint[] = [],
  gridStep = 10,
): Snap {
  const onPlane = (p: Vec3) => Math.abs(dot(sub(p, frame.origin), frame.normal)) < 1e-5;
  const candidates: (Snap & { priority: number })[] = [...modelSnapPoints(bodies, meshes), ...extra]
    .filter((p) => onPlane(p.point))
    .map((p) => ({ ...p, priority: 0 }));
  const lines: { id: string; points: [Vec3, Vec3] }[] = [];
  for (const guide of guides) {
    if (guide.mode !== 'guide') continue;
    const ends = guidePoints(bodies, guide);
    if (!ends || !ends.every(onPlane)) continue;
    lines.push({ id: guide.id, points: ends });
  }
  candidates.push(...guideSnapCandidates(raw, lines, threshold));
  const uv = toUV(raw, frame);
  if (reference) {
    const p = ontoFrame(reference.point, frame),
      r = toUV(p, frame);
    for (const point of [fromUV([r[0], uv[1]], frame), fromUV([uv[0], r[1]], frame)])
      candidates.push({
        point,
        label: `Viite · ${reference.label}`,
        key: 'reference',
        line: [p, point],
        priority: 1,
      });
  }
  if (start) {
    const s = toUV(start, frame),
      dx = uv[0] - s[0],
      dy = uv[1] - s[1],
      angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
      c = Math.cos(angle),
      v = Math.sin(angle),
      along = dx * c + dy * v;
    candidates.push({
      point: fromUV([s[0] + c * along, s[1] + v * along], frame),
      key: 'direction',
      label: `Suunta ${Math.round((angle * 180) / Math.PI)}°`,
      line: [start, fromUV([s[0] + c * along, s[1] + v * along], frame)],
      priority: 2,
    });
  }
  const near = candidates
    .filter((p) => Math.hypot(...sub(p.point, raw)) < threshold)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        Math.hypot(...sub(a.point, raw)) - Math.hypot(...sub(b.point, raw)),
    )[0];
  if (near) {
    if (near.key === 'direction' && grid && start) {
      const delta = sub(near.point, start),
        length = Math.hypot(...delta);
      if (length > 1e-8)
        near.point = start.map(
          (n, i) => n + (delta[i] / length) * Math.round(length / gridStep) * gridStep,
        ) as Vec3;
    }
    return near;
  }
  return grid
    ? {
        point: fromUV(
          [Math.round(uv[0] / gridStep) * gridStep, Math.round(uv[1] / gridStep) * gridStep],
          frame,
        ),
        label: `Ruudukko · ${gridStep} mm`,
        key: 'grid',
      }
    : { point: raw, label: 'Piirtotaso', key: 'free' };
}
interface Options {
  gridStep?: number;
  plane?: WorkPlane;
  meshes?: BodyMesh[];
  guides?: Guide[];
  reference?: ReferencePoint;
  inferenceOrigin?: Vec3;
  forceDirection?: boolean;
  excludeId?: string;
  excludeIds?: string[];
  projectGuides?: boolean;
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
  const gridStep = options.gridStep ?? 10;
  const [u, v, normal] = planeAxes[options.plane ?? 'XY'];
  let point = [...raw] as Vec3;
  if (axis && anchor) point = point.map((n, i) => (i === axisIndex[axis] ? n : anchor[i])) as Vec3;
  const candidates: (Snap & { priority: number })[] = [
    { point: [0, 0, 0], label: 'Origo', key: 'origin', priority: 0 },
    ...modelSnapPoints(
      bodies.filter((b) => b.id !== options.excludeId && !options.excludeIds?.includes(b.id)),
      options.meshes,
    ).map((p) => ({ ...p, priority: 0 })),
  ];
  const lines: { id: string; points: [Vec3, Vec3] }[] = [];
  for (const guide of options.guides ?? []) {
    if (guide.mode !== 'guide') continue;
    const pts = guidePoints(bodies, guide);
    if (!pts) continue;
    const [a, b] = pts.map((p) => [...p] as Vec3);
    if (options.projectGuides && Math.abs(a[normal] - b[normal]) < 1e-5) {
      a[normal] = point[normal];
      b[normal] = point[normal];
    }
    const delta = b.map((n, i) => n - a[i]),
      length2 = delta.reduce((s, n) => s + n * n, 0);
    if (
      length2 < 1e-8 ||
      Math.abs(a[normal] - point[normal]) > 1e-5 ||
      Math.abs(b[normal] - point[normal]) > 1e-5
    )
      continue;
    lines.push({ id: guide.id, points: [a, b] });
  }
  candidates.push(...guideSnapCandidates(point, lines, threshold));
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
    direction[u] = Math.abs(Math.cos(angle)) < 1e-12 ? 0 : Math.cos(angle);
    direction[v] = Math.abs(Math.sin(angle)) < 1e-12 ? 0 : Math.sin(angle);
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
    eligible.find(
      (c) =>
        c.key === previous.key &&
        distance(c.point, point) < threshold * 1.5 &&
        !eligible.some(
          (other) => other.priority < c.priority && distance(other.point, point) < threshold,
        ),
    );
  const closest =
    stable ??
    eligible
      .filter((c) => distance(c.point, point) < threshold)
      .sort(
        (a, b) => a.priority - b.priority || distance(a.point, point) - distance(b.point, point),
      )[0];
  if (closest) {
    if (grid && closest.key.startsWith('direction:') && options.inferenceOrigin) {
      const start = options.inferenceOrigin,
        delta = closest.point.map((n, i) => n - start[i]),
        length = Math.hypot(...delta);
      if (length > 1e-8)
        return {
          ...closest,
          point: start.map(
            (n, i) => n + (delta[i] / length) * Math.round(length / gridStep) * gridStep,
          ) as Vec3,
        };
    }
    return closest;
  }
  if (grid && !options.forceDirection)
    return {
      point: point.map((n, i) =>
        (!axis ? i !== normal : i === axisIndex[axis]) ? Math.round(n / gridStep) * gridStep : n,
      ) as Vec3,
      label: `Ruudukko · ${gridStep} mm`,
      key: 'grid',
    };
  return { point, label: axis ? `${axis.toUpperCase()}-akseli` : 'Vapaa', key: 'free' };
}
