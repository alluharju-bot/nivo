import { corners, type Anchor, type Body, type Guide, type Vec3, type WorkPlane } from './project';
import { add, dot, scale, sub, unit } from './geometry';

export const planeAxes: Record<WorkPlane, [number, number, number]> = {
  XY: [0, 1, 2],
  XZ: [0, 2, 1],
  YZ: [1, 2, 0],
};
export const normalizedAngle = (angle: number) => ((angle % 360) + 360) % 360;
export function parseAngle(value: string) {
  const clean = value.trim().replace(/°$/, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean) || !Number.isFinite(Number(clean)))
    throw new Error('Anna kulma asteina, esimerkiksi 45 tai 22,5.');
  return normalizedAngle(Number(clean));
}
export function guideDirection(plane: WorkPlane, angle: number): Vec3 {
  const [u, v] = planeAxes[plane],
    radians = (angle * Math.PI) / 180;
  const result: Vec3 = [0, 0, 0];
  result[u] = Math.cos(radians);
  result[v] = Math.sin(radians);
  return result;
}
export function resolveAnchor(bodies: Body[], anchor: Anchor): Vec3 | undefined {
  if ('point' in anchor) return anchor.point;
  if ('edge' in anchor) {
    const a = resolveAnchor(bodies, anchor.edge.from),
      b = resolveAnchor(bodies, anchor.edge.to);
    if (!a || !b) return;
    const point = add(a, scale(sub(b, a), anchor.edge.t)),
      body = bodies.find((body) => body.id === anchor.edge.from.bodyId);
    // Surviving endpoints alone do not prove the edge still exists after a cut.
    if (body?.feature.type === 'brep' && body.linearEdges) {
      const local = sub(point, body.origin);
      if (
        !body.linearEdges.some(([start, end]) => {
          const direction = sub(end, start),
            length2 = dot(direction, direction);
          if (length2 < 1e-14) return false;
          const t = dot(sub(local, start), direction) / length2;
          return (
            t >= -1e-7 &&
            t <= 1 + 1e-7 &&
            Math.hypot(...sub(local, add(start, scale(direction, t)))) < 1e-5
          );
        })
      )
        return;
    }
    return point;
  }
  const body = bodies.find((b) => b.id === anchor.bodyId);
  if (!body) return;
  if (body.vertexRefs?.[anchor.key]) return add(body.origin, body.vertexRefs[anchor.key]);
  if (body.feature.type === 'profile-extrusion' && anchor.key.startsWith('profile:'))
    return add(body.origin, anchor.local);
  if (body.feature.type === 'rectangle-extrusion' && /^corner:[0-7]$/.test(anchor.key))
    return corners(body)[Number(anchor.key.slice(7))];
  if (body.feature.type === 'union' && anchor.key.startsWith('vertex:'))
    return anchor.local.map((n, i) => n + body.origin[i]) as Vec3;
  if (body.feature.type === 'brep' && anchor.key.startsWith(`brep:${body.feature.topologyId}:`))
    return add(body.origin, anchor.local);
  if (body.feature.type === 'planar-polygon' && anchor.key.startsWith('point:')) {
    const point = body.feature.points[Number(anchor.key.slice(6))];
    return point ? add(point, body.origin) : undefined;
  }
  if (body.feature.type === 'polygon-extrusion') {
    const match = anchor.key.match(/^polygon:(\d+):(bottom|top)$/);
    if (!match) return;
    const point = body.feature.points[Number(match[1])];
    if (!point) return;
    return [
      point[0] + body.origin[0],
      point[1] + body.origin[1],
      body.origin[2] + (match[2] === 'top' ? body.feature.height : 0),
    ];
  }
}
export function guidePoints(bodies: Body[], guide: Guide): [Vec3, Vec3] | undefined {
  const anchor = resolveAnchor(bodies, guide.anchor);
  if (!anchor) return;
  const start = add(anchor, guide.offset ?? [0, 0, 0]);
  if (guide.endAnchor) {
    const end = resolveAnchor(bodies, guide.endAnchor);
    return end ? [start, end] : undefined;
  }
  const direction = guideVector(guide);
  return [start, start.map((n, i) => n + direction[i] * guide.length) as Vec3];
}
export function guideVector(guide: Guide): Vec3 {
  return guide.direction ? unit(guide.direction) : guideDirection(guide.plane, guide.angle);
}
// Offset guides measure across the gap from their source, never along the edge.
export function guideMeasurement(bodies: Body[], guide: Guide): [Vec3, Vec3] | undefined {
  const points = guidePoints(bodies, guide);
  if (!points) return;
  if (guide.mode === 'guide' && guide.offset) {
    const anchor = resolveAnchor(bodies, guide.anchor);
    return anchor ? [anchor, points[0]] : undefined;
  }
  return points;
}

export function lineIntersection(a: [Vec3, Vec3], b: [Vec3, Vec3]): Vec3 | undefined {
  const u = unit(sub(a[1], a[0])),
    v = unit(sub(b[1], b[0]));
  const w = sub(a[0], b[0]),
    uv = dot(u, v),
    denominator = 1 - uv * uv;
  if (denominator < 1e-10) return;
  const first = add(a[0], scale(u, (uv * dot(v, w) - dot(u, w)) / denominator));
  const second = add(b[0], scale(v, (dot(v, w) - uv * dot(u, w)) / denominator));
  return Math.hypot(...sub(first, second)) < 1e-5 ? scale(add(first, second), 0.5) : undefined;
}
export function angleBetween(start: Vec3, end: Vec3, plane: WorkPlane, free = false) {
  const [u, v] = planeAxes[plane];
  const angle = (Math.atan2(end[v] - start[v], end[u] - start[u]) * 180) / Math.PI;
  return normalizedAngle(free ? angle : Math.round(angle / 45) * 45);
}
