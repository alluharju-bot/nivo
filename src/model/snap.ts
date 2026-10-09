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
import { circleLineIntersections } from './curveSnap';
import { fromUV, toUV, ontoFrame, type SketchFrame } from './sketch';
import { add, scale, dot, sub } from './geometry';
/** Lower is stronger: explicit vertices, midpoints, edges, then inference/grid. */
export const snapPriority = (point: { key: string; label: string }) =>
  /^pen:/.test(point.key) ||
  point.label === 'Viivan piste' ||
  point.label === 'Pintojen risteyspiste'
    ? -1
    : /:mid:|:center$/.test(point.key) || /keskipiste/i.test(point.label)
      ? 1
      : /edge|:line/.test(point.key) || point.label === 'Reuna'
        ? 2
        : 0;
/** Priority is a small acquisition preference, not a veto over a precisely aimed point. */
export const snapScore = (distance: number, priority: number, preference = 3) =>
  distance + priority * preference;
export const gridLength = (value: number, step: number, enabled = true) =>
  enabled ? Number((Math.round(value / step) * step).toPrecision(14)) : value;
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
export type SnapLine = { id: string; points: [Vec3, Vec3]; mode?: Guide['mode'] };
/** Free measurements are finite segments; construction guides extend indefinitely. */
export function onSnapLine(point: Vec3, line: SnapLine) {
  if (line.mode !== 'free') return true;
  const delta = sub(line.points[1], line.points[0]);
  const t = dot(sub(point, line.points[0]), delta) / dot(delta, delta);
  return t >= -1e-7 && t <= 1 + 1e-7;
}
export function closestOnSnapLine(raw: Vec3, line: SnapLine): Vec3 {
  const delta = sub(line.points[1], line.points[0]);
  const length2 = dot(delta, delta);
  if (length2 < 1e-14) return line.points[0];
  const t = dot(sub(raw, line.points[0]), delta) / length2;
  const along = line.mode === 'free' ? Math.max(0, Math.min(1, t)) : t;
  return line.points[0].map((n, i) => n + delta[i] * along) as Vec3;
}
/** True 3D crossing; CAD edges are finite even when a construction guide is infinite. */
export function guideEdgeIntersection(
  line: SnapLine,
  edge: Pick<import('../cad/protocol').CadEdge, 'start' | 'end'> &
    Partial<import('../cad/protocol').CadEdge>,
): Vec3 | undefined {
  if (edge.circle)
    return circleLineIntersections(line.points, edge as import('../cad/protocol').CadEdge).find(
      (point) => onSnapLine(point, line),
    );
  if (
    Math.hypot(...sub(edge.end, edge.start)) < 1e-8 ||
    Math.hypot(...sub(line.points[1], line.points[0])) < 1e-8
  )
    return;
  const point = lineIntersection(line.points, [edge.start, edge.end]);
  return point &&
    onSnapLine(point, line) &&
    onSnapLine(point, { id: 'edge', points: [edge.start, edge.end], mode: 'free' })
    ? point
    : undefined;
}
/** Shift-only reference: a crossing in the guide's plane, returned on the real 3D edge. */
export function guideEdgeProjection(
  line: SnapLine,
  edge: import('../cad/protocol').CadEdge,
  normal: Vec3,
): Vec3 | undefined {
  const origin = line.points[0];
  const project = (p: Vec3) => sub(p, scale(normal, dot(sub(p, origin), normal)));
  if (edge.circle) {
    if (Math.abs(dot(edge.circle.normal, normal)) < 1 - 1e-6) return;
    const offset = scale(normal, dot(sub(edge.circle.center, origin), normal));
    const shifted = { ...line, points: line.points.map((p) => add(p, offset)) as [Vec3, Vec3] };
    return guideEdgeIntersection(shifted, edge);
  }
  const a = project(edge.start),
    b = project(edge.end),
    delta = sub(b, a);
  if (dot(delta, delta) < 1e-12) return;
  const point = guideEdgeIntersection(line, { start: a, end: b });
  if (!point) return;
  const t = dot(sub(point, a), delta) / dot(delta, delta);
  return add(edge.start, scale(sub(edge.end, edge.start), t));
}
export function guideSnapCandidates(raw: Vec3, lines: SnapLine[], threshold: number) {
  const candidates: (Snap & { priority: number })[] = [];
  const nearby = lines.filter((line) => {
    const { id, points } = line;
    if (Math.hypot(...sub(points[1], points[0])) < 1e-8) return false;
    const point = closestOnSnapLine(raw, line);
    if (Math.hypot(...sub(point, raw)) > threshold * 1.5) return false;
    const name = line.mode === 'free' ? 'Mittaviiva' : 'Apuviiva';
    candidates.push(
      { point: points[0], key: `${id}:start`, label: `${name} · alku`, priority: -1 },
      { point: points[1], key: `${id}:end`, label: `${name} · pää`, priority: -1 },
      {
        point: points[0].map((n, i) => (n + points[1][i]) / 2) as Vec3,
        key: `${id}:mid`,
        label: `${name} · keskipiste`,
        priority: 0.5,
      },
      { point, key: `${id}:line`, label: name, line: points, priority: 1.5 },
    );
    return true;
  });
  for (let i = 0; i < nearby.length; i++)
    for (let j = i + 1; j < nearby.length; j++) {
      const point = lineIntersection(nearby[i].points, nearby[j].points);
      if (point && onSnapLine(point, nearby[i]) && onSnapLine(point, nearby[j]))
        candidates.push({
          point,
          key: `${nearby[i].id}:${nearby[j].id}:intersection`,
          label:
            nearby[i].mode === 'free' || nearby[j].mode === 'free'
              ? 'Mittaviivojen risteys'
              : 'Apuviivojen risteys',
          priority: -1,
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
  directionGrid: 'length' | 'coordinates' = 'length',
  geometryPoints = modelSnapPoints(bodies, meshes),
  directionAngleLimit = Infinity,
): Snap {
  const onPlane = (p: Vec3) => Math.abs(dot(sub(p, frame.origin), frame.normal)) < 1e-5;
  const candidates: (Snap & { priority: number })[] = [...geometryPoints, ...extra]
    .filter((p) => onPlane(p.point))
    .map((p) => ({ ...p, priority: snapPriority(p) }));
  const lines: SnapLine[] = [];
  for (const guide of guides) {
    const ends = guidePoints(bodies, guide);
    if (!ends || !ends.every(onPlane)) continue;
    lines.push({ id: guide.id, points: ends, mode: guide.mode });
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
    if (
      (Math.acos(Math.min(1, Math.abs(along) / (Math.hypot(dx, dy) || 1))) * 180) / Math.PI <=
      directionAngleLimit
    )
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
        snapScore(Math.hypot(...sub(a.point, raw)), a.priority, threshold * 0.15) -
        snapScore(Math.hypot(...sub(b.point, raw)), b.priority, threshold * 0.15),
    )[0];
  if (near) {
    if (near.key === 'direction' && grid && start) {
      const delta = sub(near.point, start),
        length = Math.hypot(...delta);
      if (length > 1e-8) {
        const uvDelta = toUV(near.point, { ...frame, origin: start });
        // A rectangle snaps its side dimensions; a pen segment snaps its length.
        const step =
          directionGrid === 'coordinates'
            ? (gridStep * length) / Math.max(...uvDelta.map(Math.abs))
            : gridStep;
        near.point = start.map(
          (n, i) => n + (delta[i] / length) * Math.round(length / step) * step,
        ) as Vec3;
        near.line = [start, near.point];
      }
    }
    return near;
  }
  return grid
    ? {
        point: fromUV(
          uv.map((v, i) => {
            const base = start ? toUV(start, frame)[i] : 0;
            return base + gridLength(v - base, gridStep);
          }) as [number, number],
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
const meshLookup = new WeakMap<BodyMesh[], Map<string, BodyMesh>>();
const meshPoints = new WeakMap<BodyMesh, ReferencePoint[]>();
export function modelSnapPoints(bodies: Body[], meshes?: BodyMesh[]): ReferencePoint[] {
  let byId = meshes && meshLookup.get(meshes);
  if (meshes && !byId) {
    byId = new Map(meshes.map((mesh) => [mesh.id, mesh]));
    meshLookup.set(meshes, byId);
  }
  return bodies.flatMap((body) => {
    const mesh = byId?.get(body.id);
    const cached = mesh && meshPoints.get(mesh);
    if (cached) return cached;
    const points: ReferencePoint[] = mesh
      ? mesh.verticesCAD.map((v) => ({
          point: v.point,
          label: mesh.faces?.length === 0 ? 'Viivan piste' : 'Verteksi',
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
    if (mesh) meshPoints.set(mesh, points);
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
    ).map((p) => ({ ...p, priority: snapPriority(p) })),
  ];
  const lines: SnapLine[] = [];
  for (const guide of options.guides ?? []) {
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
    lines.push({ id: guide.id, points: [a, b], mode: guide.mode });
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
          (other) =>
            distance(other.point, point) < threshold &&
            snapScore(distance(other.point, point), other.priority, threshold * 0.15) +
              threshold * 0.05 <
              snapScore(distance(c.point, point), c.priority, threshold * 0.15),
        ),
    );
  const closest =
    stable ??
    eligible
      .filter((c) => distance(c.point, point) < threshold)
      .sort(
        (a, b) =>
          snapScore(distance(a.point, point), a.priority, threshold * 0.15) -
          snapScore(distance(b.point, point), b.priority, threshold * 0.15),
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
        (!axis ? i !== normal : i === axisIndex[axis])
          ? (options.inferenceOrigin?.[i] ?? 0) +
            gridLength(n - (options.inferenceOrigin?.[i] ?? 0), gridStep)
          : n,
      ) as Vec3,
      label: `Ruudukko · ${gridStep} mm`,
      key: 'grid',
    };
  return { point, label: axis ? `${axis.toUpperCase()}-akseli` : 'Vapaa', key: 'free' };
}
