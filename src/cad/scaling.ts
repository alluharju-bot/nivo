import { ZodError } from 'zod';
import { deserializeShape } from 'replicad';
import { bodySchema, projectValidationMessage, type Body, type Vec3 } from '../model/project';
import { add, sub } from '../model/geometry';
import { requireMovable } from '../model/transforms';
import { scalePoint } from '../model/scaling';
import { bodyFromShape, createShape } from './kernel';
import { shapeVertexReferences } from './vertexReferences';

export async function scaleBodies(bodies: Body[], pivot: Vec3, factors: Vec3): Promise<Body[]> {
  requireMovable(bodies);
  if (![...pivot, ...factors].every(Number.isFinite) || factors.some((f) => f <= 0 || f > 1000))
    throw new Error('Anna positiiviset skaalauskertoimet, enintään 1000.');
  if (factors.every((f) => Math.abs(f - 1) < 1e-12)) return bodies;
  const uniform = factors.every((f) => Math.abs(f - factors[0]) < 1e-12);
  const affine = uniform ? undefined : (await import('./affineKernel')).affineBrep;
  const result: Body[] = [];
  for (const body of bodies) {
    const shape = createShape(body);
    try {
      const scaled = uniform
        ? shape.clone().scale(factors[0], pivot)
        : deserializeShape(await affine!(shape.serialize(), pivot, factors));
      try {
        const next = bodyFromShape(body, scaled, []);
        const local = (p: Vec3) => sub(scalePoint(p, pivot, factors), next.origin);
        const references = [
          ...shapeVertexReferences(body, shape),
          ...Object.entries(body.vertexRefs ?? {}).map(([key, p]) => ({
            key,
            point: add(body.origin, p),
          })),
        ];
        result.push(
          bodySchema.parse({
            ...next,
            component: body.component
              ? { ...body.component, offset: local(add(body.origin, body.component.offset)) }
              : undefined,
            textureFrame: {
              rotation: body.textureFrame?.rotation ?? [0, 0, 0, 1],
              offset: local(add(body.origin, body.textureFrame?.offset ?? [0, 0, 0])),
            },
            curve: body.curve
              ? { ...body.curve, points: body.curve.points.map((p) => local(add(body.origin, p))) }
              : undefined,
            curveSnaps: body.curveSnaps,
            vertexRefs: Object.fromEntries(references.map(({ key, point }) => [key, local(point)])),
          }),
        );
      } finally {
        scaled.delete();
      }
    } catch (error) {
      if (error instanceof ZodError) throw new Error(projectValidationMessage(error));
      throw error;
    } finally {
      shape.delete();
    }
  }
  return result;
}
