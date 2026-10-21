import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';

/** Exact convex pieces for star-shaped shards. Voxel hulls can bridge narrow notches
 * and jam a fresh shard in its own hole. A feasible visibility-kernel point lets
 * us tetrahedralize the closed surface without expanding its boundary. */
export function starCollider(vertices: Float32Array, indices: Uint32Array, scale: number) {
  if (indices.length > 3000) return null;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const planes: { normal: Vector3; offset: number }[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    a.fromArray(vertices, indices[t] * 3);
    b.fromArray(vertices, indices[t + 1] * 3);
    c.fromArray(vertices, indices[t + 2] * 3);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-20) continue;
    normal.normalize();
    planes.push({ normal, offset: normal.dot(a) });
  }
  const kernel = new Vector3();
  for (let iteration = 0; iteration < 256; iteration++) {
    let violation = 0;
    for (const plane of planes) {
      const distance = plane.normal.dot(kernel) - plane.offset + 1e-7;
      if (distance > 0) {
        kernel.addScaledVector(plane.normal, -distance);
        violation = Math.max(violation, distance);
      }
    }
    if (violation < 1e-9) break;
  }
  if (planes.some((p) => p.normal.dot(kernel) > p.offset - 1e-9)) return null;
  const shapes: RAPIER.Shape[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    a.fromArray(vertices, indices[t] * 3)
      .sub(kernel)
      .multiplyScalar(scale)
      .add(kernel);
    b.fromArray(vertices, indices[t + 1] * 3)
      .sub(kernel)
      .multiplyScalar(scale)
      .add(kernel);
    c.fromArray(vertices, indices[t + 2] * 3)
      .sub(kernel)
      .multiplyScalar(scale)
      .add(kernel);
    if (
      Math.abs(
        a
          .clone()
          .sub(kernel)
          .dot(b.clone().sub(kernel).cross(c.clone().sub(kernel))),
      ) < 1e-14
    )
      continue;
    const tetra = RAPIER.ColliderDesc.convexHull(
      new Float32Array([...kernel.toArray(), ...a.toArray(), ...b.toArray(), ...c.toArray()]),
    );
    if (!tetra) return null;
    shapes.push(tetra.shape);
  }
  if (!shapes.length) return null;
  return RAPIER.ColliderDesc.compound(
    shapes,
    shapes.map(() => ({ x: 0, y: 0, z: 0 })),
    shapes.map(() => ({ x: 0, y: 0, z: 0, w: 1 })),
    RAPIER.CompoundFlags.FIX_INTERNAL_EDGES,
  );
}
