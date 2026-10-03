import { Quaternion, Vector3 } from 'three';
import { bodySchema, type Body, type Vec3 } from '../model/project';
import { add, sub } from '../model/geometry';
import { bodyFromShape, createShape } from './kernel';

/** Place a definition's exact geometry into each instance's own rigid frame. */
export function instantiateComponents(source: Body, targets: Body[]): Body[] {
  if (!source.component) throw new Error('Lähtöosalta puuttuu komponenttilinkki.');
  const from = add(source.origin, source.component.offset);
  const qSource = new Quaternion(...source.component.rotation).normalize();
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
    if (Math.abs(q.w) > 1 - 1e-10 && source.feature.type === 'rectangle-extrusion') {
      const origin = transform(source.origin);
      return bodySchema.parse({
        ...target,
        feature: source.feature,
        origin,
        vertexRefs: undefined,
        linearEdges: undefined,
        edgeTreatment: undefined,
        component: { ...target.component, offset: sub(to, origin) },
        textureFrame: target.textureFrame
          ? {
              ...target.textureFrame,
              offset: sub(add(target.origin, target.textureFrame.offset), origin),
            }
          : undefined,
      });
    }
    const shape = createShape(source);
    let placed = shape.clone();
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
      return bodySchema.parse({
        ...next,
        component: { ...target.component, offset: sub(to, next.origin) },
        edgeTreatment: source.edgeTreatment
          ? {
              ...source.edgeTreatment,
              offset: sub(transform(add(source.origin, source.edgeTreatment.offset)), next.origin),
              rotation: q
                .clone()
                .multiply(new Quaternion(...source.edgeTreatment.rotation))
                .normalize()
                .toArray(),
            }
          : undefined,
      });
    } finally {
      placed.delete();
      shape.delete();
    }
  });
}
