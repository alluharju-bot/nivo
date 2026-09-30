import { corners, type Anchor, type Body, type Guide, type Vec3, type WorkPlane } from './project';

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
  const body = bodies.find((b) => b.id === anchor.bodyId);
  if (!body) return;
  if (body.feature.type === 'rectangle-extrusion' && /^corner:[0-7]$/.test(anchor.key))
    return corners(body)[Number(anchor.key.slice(7))];
  if (body.feature.type === 'union' && anchor.key.startsWith('vertex:'))
    return anchor.local.map((n, i) => n + body.origin[i]) as Vec3;
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
  const start = resolveAnchor(bodies, guide.anchor);
  if (!start) return;
  if (guide.endAnchor) {
    const end = resolveAnchor(bodies, guide.endAnchor);
    return end ? [start, end] : undefined;
  }
  const direction = guideDirection(guide.plane, guide.angle);
  return [start, start.map((n, i) => n + direction[i] * guide.length) as Vec3];
}
export function angleBetween(start: Vec3, end: Vec3, plane: WorkPlane, free = false) {
  const [u, v] = planeAxes[plane];
  const angle = (Math.atan2(end[v] - start[v], end[u] - start[u]) * 180) / Math.PI;
  return normalizedAngle(free ? angle : Math.round(angle / 45) * 45);
}
