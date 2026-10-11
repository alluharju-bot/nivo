import { Matrix4, Quaternion, Vector3 } from 'three';
import type { AnyShape } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import { cutGeometryKey } from '../model/cutting';
import { quantityBasis } from '../model/quantityBasis';
import { exactBounds } from './kernel';

/** Measure the edited part in its established stock frame, never the world's AABB.
 * Runs only after a geometry edit with a known automatic stock frame. */
export function updatedQuantityBounds(before: Body, after: Body, shape: AnyShape) {
  const basis = quantityBasis(before);
  if (!basis?.axes || basis.manual) return before.quantityBasis;
  const x = new Vector3(...basis.axes[0]),
    y = new Vector3(...basis.axes[1]);
  const z = x.clone().cross(y).normalize();
  const q = new Quaternion()
    .setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
    .normalize()
    .invert();
  let local: AnyShape | undefined;
  try {
    const axis = new Vector3(q.x, q.y, q.z);
    if (axis.lengthSq() > 1e-16)
      local = shape
        .clone()
        .rotate(
          (2 * Math.acos(Math.max(-1, Math.min(1, q.w))) * 180) / Math.PI,
          [0, 0, 0],
          axis.normalize().toArray() as Vec3,
        );
    const { min, max } = exactBounds(local ?? shape);
    return {
      ...basis,
      dimensions: max.map((n, i) => Math.round((n - min[i]) * 1e6) / 1e6) as Vec3,
      geometryKey: cutGeometryKey(after),
    };
  } catch {
    // Keep the stale key so the UI requests confirmation instead of publishing a guess.
    return before.quantityBasis;
  } finally {
    local?.delete();
  }
}
