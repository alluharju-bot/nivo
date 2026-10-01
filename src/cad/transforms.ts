import { bodySchema, type Body, type Vec3 } from '../model/project';
import { add, sub, unit } from '../model/geometry';
import { requireMovable, rotatePoint } from '../model/transforms';
import { bodyFromShape, createShape, meshBody } from './kernel';

/** Rotate the exact BRep, preserving the identity of every attached vertex. */
export function rotateBodies(bodies: Body[], pivot: Vec3, axis: Vec3, angle: number): Body[] {
  requireMovable(bodies);
  if (
    !Number.isFinite(angle) ||
    Math.abs(angle) > 360000 ||
    ![...pivot, ...axis].every(Number.isFinite) ||
    Math.hypot(...axis) < 1e-9
  )
    throw new Error('Tarkista kiertopiste, akseli ja kulma.');
  if (Math.abs(angle % 360) < 1e-9) return bodies;
  const direction = unit(axis);
  return bodies.map((body) => {
    const shape = createShape(body);
    const rotated = shape.clone().rotate(angle, pivot, direction);
    try {
      const next = bodyFromShape(body, rotated, []);
      const references = [
        ...meshBody(body, shape).verticesCAD.map((v) => ({ key: v.anchor.key, point: v.point })),
        ...Object.entries(body.vertexRefs ?? {}).map(([key, local]) => ({
          key,
          point: add(body.origin, local),
        })),
      ];
      return bodySchema.parse({
        ...next,
        vertexRefs: Object.fromEntries(
          references.map(({ key, point }) => [
            key,
            sub(rotatePoint(point, pivot, direction, angle), next.origin),
          ]),
        ),
      });
    } finally {
      rotated.delete();
      shape.delete();
    }
  });
}
