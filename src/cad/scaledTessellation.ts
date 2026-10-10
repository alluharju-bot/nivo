import type { AnyShape } from 'replicad';
import type { Vec3 } from '../model/project';
import { shapeFaces } from './topology';

/** Tessellate the simpler source before deforming it. Tighten both tolerances so
 * enlargement/anisotropy cannot relax the existing 0.15 mm / 0.1 rad limits.
 * CAD geometry, face centres and all snap edges still come from the exact result.
 */
export function scaledTessellation(
  source: AnyShape,
  target: AnyShape,
  pivot: Vec3,
  factors: Vec3,
  faceMap?: number[],
) {
  const max = Math.max(...factors),
    min = Math.min(...factors),
    condition = max / min;
  if (!faceMap || max > 20 || condition > 20) return;
  const before = shapeFaces(source),
    after = shapeFaces(target);
  try {
    if (
      before.length !== faceMap.length ||
      after.length !== faceMap.length ||
      faceMap.some((i) => !Number.isInteger(i) || i < 0 || i >= after.length) ||
      new Set(faceMap).size !== after.length
    )
      return;
    const indices = new Map(before.map((face, i) => [face.hashCode, i]));
    const mesh = source.mesh({
      tolerance: 0.15 / Math.max(1, max),
      angularTolerance: 2 * Math.atan(Math.tan(0.1 / 2) / condition),
    });
    if (mesh.faceGroups.some((g) => !indices.has(g.faceId))) return;
    const vertices = mesh.vertices.map(
      (v, i) => pivot[i % 3] + (v - pivot[i % 3]) * factors[i % 3],
    );
    const normals = new Array<number>(mesh.normals.length);
    for (let i = 0; i < normals.length; i += 3) {
      const x = mesh.normals[i] / factors[0],
        y = mesh.normals[i + 1] / factors[1],
        z = mesh.normals[i + 2] / factors[2],
        length = Math.hypot(x, y, z) || 1;
      normals[i] = x / length;
      normals[i + 1] = y / length;
      normals[i + 2] = z / length;
    }
    return {
      vertices,
      normals,
      triangles: mesh.triangles,
      faceGroups: mesh.faceGroups.map((g) => ({
        ...g,
        faceId: after[faceMap[indices.get(g.faceId)!]].hashCode,
      })),
    };
  } finally {
    before.forEach((f) => f.delete());
    after.forEach((f) => f.delete());
  }
}
