import { ZodError } from 'zod';
import { deserializeShape } from 'replicad';
import { bodySchema, projectValidationMessage, type Body, type Vec3 } from '../model/project';
import { add, sub } from '../model/geometry';
import { requireMovable } from '../model/transforms';
import { scalePoint } from '../model/scaling';
import { bodyFromShape, createShape, meshBody } from './kernel';
import { shapeVertexReferences } from './vertexReferences';
import type { TransformCache } from './buildCache';
import { scaledTessellation } from './scaledTessellation';

export async function scaleBodies(
  bodies: Body[],
  pivot: Vec3,
  factors: Vec3,
  cache?: TransformCache,
): Promise<Body[]> {
  requireMovable(bodies);
  if (![...pivot, ...factors].every(Number.isFinite) || factors.some((f) => f <= 0 || f > 1000))
    throw new Error('Anna positiiviset skaalauskertoimet, enintään 1000.');
  if (factors.every((f) => Math.abs(f - 1) < 1e-12)) return bodies;
  const uniform = factors.every((f) => Math.abs(f - factors[0]) < 1e-12);
  const result: Body[] = [];
  for (const body of bodies) {
    if (body.feature.type === 'rectangle-extrusion') {
      const local = (p: Vec3) => p.map((v, i) => v * factors[i]) as Vec3;
      try {
        result.push(
          bodySchema.parse({
            ...body,
            origin: scalePoint(body.origin, pivot, factors),
            feature: {
              ...body.feature,
              width: body.feature.width * factors[0],
              depth: body.feature.depth * factors[1],
              height: body.feature.height * factors[2],
            },
            component: body.component
              ? { ...body.component, offset: local(body.component.offset) }
              : undefined,
            textureFrame: {
              rotation: body.textureFrame?.rotation ?? [0, 0, 0, 1],
              offset: local(body.textureFrame?.offset ?? [0, 0, 0]),
            },
            vertexRefs: body.vertexRefs
              ? Object.fromEntries(
                  Object.entries(body.vertexRefs).map(([key, p]) => [key, local(p)]),
                )
              : undefined,
          }),
        );
      } catch (error) {
        if (error instanceof ZodError) throw new Error(projectValidationMessage(error));
        throw error;
      }
      continue;
    }
    const shape = cache?.shape(body) ?? createShape(body);
    try {
      const affine = uniform ? undefined : (await import('./affineKernel')).affineBrepWithHistory;
      const transformed = uniform
        ? undefined
        : body.feature.type === 'brep'
          ? await affine!(body.feature.data, sub(pivot, body.origin), factors)
          : await affine!(shape.serialize(), pivot, factors);
      const scaled = uniform
        ? shape.clone().scale(factors[0], pivot)
        : body.feature.type === 'brep'
          ? deserializeShape(transformed!.data).translate(body.origin)
          : deserializeShape(transformed!.data);
      try {
        const next = bodyFromShape(body, scaled, []);
        const local = (p: Vec3) => sub(scalePoint(p, pivot, factors), next.origin);
        const previous = cache?.get(body);
        const references = [
          ...(previous
            ? previous.mesh.verticesCAD.map((v) => ({ key: v.anchor.key, point: v.point }))
            : shapeVertexReferences(body, shape)),
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
        if (cache && !previous?.mesh.curveStations) {
          // Uniform scaling keeps analytic surfaces; meshing its result is
          // already cheap. The source-first path helps the affine/NURBS case.
          const tessellation = uniform
            ? undefined
            : scaledTessellation(shape, scaled, pivot, factors, transformed?.faceMap);
          cache.prepare(
            result.at(-1)!,
            scaled,
            tessellation ? meshBody(result.at(-1)!, scaled, tessellation) : undefined,
          );
        }
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
