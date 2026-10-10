import { Quaternion, Vector3 } from 'three';
import { bodySchema, type Body, type Vec3 } from '../model/project';
import { add, sub } from '../model/geometry';
import { bodyFromShape, createShape } from './kernel';
import type { TransformCache } from './buildCache';

/** Place a definition's exact geometry into each instance's own rigid frame. */
export function instantiateComponents(
  source: Body,
  targets: Body[],
  cache?: TransformCache,
): Body[] {
  if (!source.component) throw new Error('Lähtöosalta puuttuu komponenttilinkki.');
  const from = add(source.origin, source.component.offset);
  const qSource = new Quaternion(...source.component.rotation).normalize();
  let sourceShape: ReturnType<typeof createShape> | undefined;
  try {
    return targets.map((target) => {
      if (!target.component) throw new Error('Kohde ei ole linkitetty komponentti.');
      const to = add(target.origin, target.component.offset);
      const q = new Quaternion(...target.component.rotation)
        .normalize()
        .multiply(qSource.clone().invert())
        .normalize();
      const transform = (p: Vec3) =>
        new Vector3(...sub(p, from))
          .applyQuaternion(q)
          .add(new Vector3(...to))
          .toArray() as Vec3;
      // A sibling with an independently regenerated topology needs the full
      // reference matching below, even if it has returned to this orientation.
      const sharedReferences =
        (source.feature.type === 'rectangle-extrusion' &&
          target.feature.type === 'rectangle-extrusion') ||
        (source.feature.type === 'brep' &&
          target.feature.type === 'brep' &&
          (source.feature.topologyId === target.feature.topologyId ||
            Object.keys(source.vertexRefs ?? {}).some((key) =>
              key.startsWith(
                `brep:${target.feature.type === 'brep' ? target.feature.topologyId : ''}:`,
              ),
            )));
      if (Math.abs(q.w) > 1 - 1e-10 && sharedReferences) {
        const origin = transform(source.origin);
        return bodySchema.parse({
          ...target,
          feature: source.feature,
          origin,
          vertexRefs: source.vertexRefs,
          linearEdges: source.linearEdges,
          edgeTreatment: source.edgeTreatment,
          curve: source.curve,
          curveSnaps: source.curveSnaps,
          penRegion: target.penRegion ? { ...target.penRegion, detached: true } : undefined,
          component: { ...target.component, offset: sub(to, origin) },
          textureFrame: target.textureFrame
            ? {
                ...target.textureFrame,
                offset: sub(add(target.origin, target.textureFrame.offset), origin),
              }
            : undefined,
        });
      }
      sourceShape ??= cache?.shape(source) ?? createShape(source);
      let placed = sourceShape.clone();
      try {
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, q.w))),
          sin = Math.sin(angle / 2);
        if (Math.abs(sin) > 1e-9) {
          const rotated = placed.rotate((angle * 180) / Math.PI, from, [
            q.x / sin,
            q.y / sin,
            q.z / sin,
          ]);
          placed = rotated;
        }
        placed = placed.translate(sub(to, from));
        const next = bodyFromShape(target, placed);
        const result = bodySchema.parse({
          ...next,
          vertexRefs: {
            ...next.vertexRefs,
            ...Object.fromEntries(
              Object.entries(source.vertexRefs ?? {}).map(([key, point]) => [
                key,
                sub(transform(add(source.origin, point)), next.origin),
              ]),
            ),
          },
          curve: source.curve
            ? {
                ...source.curve,
                points: source.curve.points.map((p) =>
                  sub(transform(add(source.origin, p)), next.origin),
                ),
              }
            : undefined,
          curveSnaps: source.curveSnaps,
          component: { ...target.component, offset: sub(to, next.origin) },
          edgeTreatment: source.edgeTreatment
            ? {
                ...source.edgeTreatment,
                offset: sub(
                  transform(add(source.origin, source.edgeTreatment.offset)),
                  next.origin,
                ),
                rotation: q
                  .clone()
                  .multiply(new Quaternion(...source.edgeTreatment.rotation))
                  .normalize()
                  .toArray(),
              }
            : undefined,
        });
        cache?.prepare(result, placed);
        return result;
      } finally {
        placed.delete();
      }
    });
  } finally {
    sourceShape?.delete();
  }
}
