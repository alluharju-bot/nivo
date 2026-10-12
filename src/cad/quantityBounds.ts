import { Matrix4, Quaternion, Vector3 } from 'three';
import type { AnyShape } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import { cutGeometryKey } from '../model/cutting';
import { orderedQuantityBasis, quantityBasis, stockAxes } from '../model/quantityBasis';
import { exactBounds } from './kernel';

/** Measure the edited part in its established stock frame, never the world's AABB.
 * Runs only after a geometry edit with a known automatic stock frame. */
export function updatedQuantityBounds(before: Body, after: Body, shape: AnyShape) {
  const basis = quantityBasis(before);
  if (before.quantityBasis?.manual) return before.quantityBasis;
  return measuredStock(after, shape, basis?.axes ?? stockAxes(before));
}

/** Exact oriented stock extents, including profiled, hollow and curved parts.
 * These are gross blank sizes, not net area or the length of a curved path. */
export function measuredStock(body: Body, shape: AnyShape, axes = stockAxes(body)) {
  if (axes.every((v) => v.some((n) => Math.abs(n) > 1 - 1e-10))) {
    const dimensions: Vec3 = [body.feature.width, body.feature.depth, body.feature.height];
    return orderedQuantityBasis({
      axes,
      geometryKey: cutGeometryKey(body),
      dimensions: axes.map((v) => dimensions[v.findIndex((n) => Math.abs(n) > 1 - 1e-10)]) as Vec3,
    });
  }
  const x = new Vector3(...axes[0]),
    y = new Vector3(...axes[1]);
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
    return orderedQuantityBasis({
      axes,
      dimensions: max.map((n, i) => Math.round((n - min[i]) * 1e6) / 1e6) as Vec3,
      geometryKey: cutGeometryKey(body),
    });
  } catch {
    // Keep the stale key so the UI requests confirmation instead of publishing a guess.
    return undefined;
  } finally {
    local?.delete();
  }
}
