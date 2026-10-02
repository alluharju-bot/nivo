import { Quaternion, Vector3 } from 'three';
import type { Body, Vec3 } from '../model/project';
import { add } from '../model/geometry';
import { createShape } from './kernel';

/** Edge indices belong to this immutable source, never to a fillet's result topology. */
export function detailSourceShape(body: Body) {
  const treatment = body.edgeTreatment;
  if (!treatment) return createShape(body);
  let shape = createShape({
    ...body,
    edgeTreatment: undefined,
    feature: treatment.source,
    origin: [0, 0, 0],
  });
  const q = new Quaternion(...treatment.rotation).normalize();
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, q.w)));
  const axis = new Vector3(q.x, q.y, q.z);
  if (axis.lengthSq() > 1e-16) {
    const rotated = shape.rotate(
      (angle * 180) / Math.PI,
      [0, 0, 0],
      axis.normalize().toArray() as Vec3,
    );
    shape = rotated;
  }
  return shape.translate(add(body.origin, treatment.offset));
}
