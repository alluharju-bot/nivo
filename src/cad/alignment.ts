import { Vector3 } from 'three';
import { bounds, type Body, type Vec3 } from '../model/project';
import { alignmentDelta, alignmentFrame, type AlignmentOptions } from '../model/alignment';
import { createShape, exactBounds } from './kernel';

/** Bounds are measured in the reference frame, never by rotating a world AABB. */
export function alignBodies(bodies: Body[], target: Body, options: AlignmentOptions): Vec3 {
  if (!bodies.length || bodies.some((b) => b.id === target.id))
    throw new Error('Valitse vertailuosaksi jokin muu kuin siirrettävä osa.');
  const q = alignmentFrame(target, options),
    inverse = q.clone().invert();
  if (Math.abs(q.w) > 1 - 1e-12) return alignmentDelta(bounds(bodies), bounds([target]), options);
  const measure = (parts: Body[]) => {
    const min: Vec3 = [Infinity, Infinity, Infinity],
      max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      let box: { min: Vec3; max: Vec3 };
      if (part.feature.type === 'mesh') {
        const points = part.feature.vertices;
        const low: Vec3 = [Infinity, Infinity, Infinity],
          high: Vec3 = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < points.length; i += 3) {
          const v = new Vector3(
            points[i] + part.origin[0],
            points[i + 1] + part.origin[1],
            points[i + 2] + part.origin[2],
          )
            .applyQuaternion(inverse)
            .toArray();
          v.forEach((n, k) => {
            low[k] = Math.min(low[k], n);
            high[k] = Math.max(high[k], n);
          });
        }
        box = { min: low, max: high };
      } else {
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, inverse.w)));
        const sin = Math.sin(angle / 2);
        let shape = createShape(part);
        try {
          shape = shape.rotate(
            (angle * 180) / Math.PI,
            [0, 0, 0],
            [inverse.x / sin, inverse.y / sin, inverse.z / sin],
          );
          box = exactBounds(shape);
        } finally {
          shape.delete();
        }
      }
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], box.min[i]);
        max[i] = Math.max(max[i], box.max[i]);
      }
    }
    return { min, max };
  };
  return alignmentDelta(measure(bodies), measure([target]), options, q);
}
