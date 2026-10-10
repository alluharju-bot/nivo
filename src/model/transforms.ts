import { isPointDimension } from './project';
import { dimensionBodyIds } from './dimensions';
import { bounds, type Body, type BodyGroup, type Project, type Vec3 } from './project';
import { add, sub, scale, dot, unit } from './geometry';
import { guideVector } from './guides';
import { groupAncestors, bodyLocked } from './groups';

export interface Rotation {
  ids: string[];
  pivot: Vec3;
  axis: Vec3;
  angle: number;
  copy?: boolean;
  picking?: 'point' | 'edge';
}
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function rotationAngle(value: string) {
  const clean = value.trim().replace(/°$/, '').trim().replace(',', '.');
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean) ||
    !Number.isFinite(Number(clean)) ||
    Math.abs(Number(clean)) > 360000
  )
    throw new Error('Anna kiertokulma asteina, esimerkiksi 90 tai −22,5.');
  return Number(clean);
}
export function rotateVector(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const n = unit(axis),
    radians = (angle * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  return add(add(scale(vector, c), scale(cross(n, vector), s)), scale(n, dot(n, vector) * (1 - c)));
}
export const rotatePoint = (point: Vec3, pivot: Vec3, axis: Vec3, angle: number): Vec3 =>
  add(pivot, rotateVector(sub(point, pivot), axis, angle));
export const bodiesCenter = (bodies: Body[]): Vec3 => {
  const { min, max } = bounds(bodies);
  return scale(add(min, max), 0.5);
};
export const rotationRadius = (bodies: Body[]) => {
  const { min, max } = bounds(bodies);
  return Math.max(40, Math.hypot(...sub(max, min)) * 0.65);
};
export const bodyVisible = (body: Body, groups: BodyGroup[]) =>
  !body.hidden && !groupAncestors(groups, body.groupId).some((g) => g.hidden);
export function requireMovable(bodies: Body[], groups: BodyGroup[] = []) {
  if (!bodies.length) throw new Error('Valitse ensin kappale.');
  if (bodies.some((b) => bodyLocked(b, groups)))
    throw new Error(
      'Valinnassa on paikalleen kiinnitetty osa. Vapauta se G-näppäimellä tai lukkopainikkeesta.',
    );
}
export function moveToOrigin(
  project: Project,
  ids: string[],
  reference: 'min' | 'center',
): Project {
  const chosen = project.bodies.filter((b) => ids.includes(b.id));
  requireMovable(chosen, project.groups);
  const anchor = reference === 'center' ? bodiesCenter(chosen) : bounds(chosen).min;
  return {
    ...project,
    bodies: project.bodies.map((b) =>
      ids.includes(b.id) ? { ...b, origin: sub(b.origin, anchor) } : b,
    ),
  };
}
export function applyRotation(project: Project, results: Body[], rotation: Rotation): Project {
  const moved = new Set(results.map((b) => b.id));
  return {
    ...project,
    bodies: project.bodies.map((b) => results.find((r) => r.id === b.id) ?? b),
    dimensions: project.dimensions.map((d) =>
      isPointDimension(d) &&
      dimensionBodyIds(d).length > 0 &&
      dimensionBodyIds(d).every((id) => moved.has(id))
        ? {
            ...d,
            offset: rotateVector(d.offset, rotation.axis, rotation.angle),
            normal: rotateVector(d.normal, rotation.axis, rotation.angle),
            fallback: d.fallback.map((p) =>
              rotatePoint(p, rotation.pivot, rotation.axis, rotation.angle),
            ) as [Vec3, Vec3],
          }
        : d,
    ),
    guides: project.guides.map((g) => {
      const anchor = 'edge' in g.anchor ? g.anchor.edge.from : g.anchor;
      if (!('bodyId' in anchor) || !moved.has(anchor.bodyId)) return g;
      return {
        ...g,
        direction: rotateVector(guideVector(g), rotation.axis, rotation.angle),
        offset: g.offset ? rotateVector(g.offset, rotation.axis, rotation.angle) : undefined,
      };
    }),
  };
}
