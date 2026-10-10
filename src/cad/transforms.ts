import { Quaternion, Vector3 } from 'three';
import { bodySchema, type Body, type Vec3 } from '../model/project';
import { add, sub, unit } from '../model/geometry';
import { requireMovable, rotatePoint } from '../model/transforms';
import { bodyFromShape, createShape } from './kernel';
import { shapeVertexReferences } from './vertexReferences';
import { rotateMesh } from './rotateMesh';
import type { TransformCache } from './buildCache';

/** Rotate the exact BRep, preserving the identity of every attached vertex. */
export function rotateBodies(
  bodies: Body[],
  pivot: Vec3,
  axis: Vec3,
  angle: number,
  cache?: TransformCache,
): Body[] {
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
    const shape = cache?.shape(body) ?? createShape(body);
    const rotated = shape.clone().rotate(angle, pivot, direction);
    try {
      const next = bodyFromShape(body, rotated, []);
      const previous = cache?.get(body);
      const references = [
        ...(previous
          ? previous.mesh.verticesCAD.map((v) => ({ key: v.anchor.key, point: v.point }))
          : shapeVertexReferences(body, shape)),
        ...Object.entries(body.vertexRefs ?? {}).map(([key, local]) => ({
          key,
          point: add(body.origin, local),
        })),
      ];
      const result = bodySchema.parse({
        ...next,
        curve: body.curve
          ? {
              ...body.curve,
              points: body.curve.points.map((p) =>
                sub(rotatePoint(add(body.origin, p), pivot, direction, angle), next.origin),
              ),
            }
          : undefined,
        curveSnaps: body.curveSnaps,
        component: body.component
          ? {
              id: body.component.id,
              offset: sub(
                rotatePoint(add(body.origin, body.component.offset), pivot, direction, angle),
                next.origin,
              ),
              rotation: new Quaternion()
                .setFromAxisAngle(new Vector3(...direction), (angle * Math.PI) / 180)
                .multiply(new Quaternion(...body.component.rotation))
                .normalize()
                .toArray(),
            }
          : undefined,
        textureFrame: {
          offset: sub(
            rotatePoint(
              add(body.origin, body.textureFrame?.offset ?? [0, 0, 0]),
              pivot,
              direction,
              angle,
            ),
            next.origin,
          ),
          rotation: new Quaternion()
            .setFromAxisAngle(new Vector3(...direction), (angle * Math.PI) / 180)
            .multiply(new Quaternion(...(body.textureFrame?.rotation ?? [0, 0, 0, 1])))
            .normalize()
            .toArray(),
        },
        edgeTreatment: body.edgeTreatment
          ? {
              ...body.edgeTreatment,
              offset: sub(
                rotatePoint(add(body.origin, body.edgeTreatment.offset), pivot, direction, angle),
                next.origin,
              ),
              rotation: new Quaternion()
                .setFromAxisAngle(new Vector3(...direction), (angle * Math.PI) / 180)
                .multiply(new Quaternion(...body.edgeTreatment.rotation))
                .normalize()
                .toArray(),
            }
          : undefined,
        vertexRefs: Object.fromEntries(
          references.map(({ key, point }) => [
            key,
            sub(rotatePoint(point, pivot, direction, angle), next.origin),
          ]),
        ),
      });
      // Drawing stations use arc-length coordinates. Read their serialized
      // geometry on commit so station keys are identical after a fresh load.
      if (!previous?.mesh.curveStations)
        cache?.prepare(
          result,
          rotated,
          previous ? rotateMesh(previous.mesh, result, pivot, direction, angle) : undefined,
        );
      return result;
    } finally {
      rotated.delete();
      shape.delete();
    }
  });
}
