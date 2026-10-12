import type { BodyMesh } from '../cad/protocol';
import { bounds, type Body, type Vec3 } from './project';
import type { Rotation } from './transforms';
import { add, sub, dot, scale, unit } from './geometry';
import { rotationDirection } from './rotationSnap';

/** Follow the actual edge through a corner, never the diagonal to the body center.
 * Away from an edge, keep a parallel line through the pivot (including center). */
export function defaultRotationGrip(rotation: Rotation, bodies: Body[], meshes: BodyMesh[]): Vec3 {
  const selected = new Set(rotation.ids),
    parts = bodies.filter((b) => selected.has(b.id)),
    geometry = meshes.filter((m) => selected.has(m.id)),
    pivot = rotation.pivot,
    normal = unit(rotation.axis);
  const projectedLength = (v: Vec3) => Math.hypot(...sub(v, scale(normal, dot(v, normal))));
  let attached: Vec3 | undefined,
    attachedLength = 0;
  let longest: Vec3 | undefined,
    longestLength = 0;
  for (const mesh of geometry) {
    for (const edge of mesh.edgesCAD) {
      if (edge.circle) continue;
      const vector = sub(edge.end, edge.start),
        lengthSquared = dot(vector, vector);
      if (lengthSquared < 1e-12) continue;
      const length = projectedLength(vector);
      if (length > longestLength + 1e-6) {
        longest = unit(vector);
        longestLength = length;
      }
      const t = dot(sub(pivot, edge.start), vector) / lengthSquared;
      if (
        t < -1e-7 ||
        t > 1 + 1e-7 ||
        Math.hypot(...sub(pivot, add(edge.start, scale(vector, t)))) > 1e-5
      )
        continue;
      for (const point of [edge.start, edge.end]) {
        const reach = projectedLength(sub(point, pivot));
        if (reach > attachedLength + 1e-6) {
          attached = point;
          attachedLength = reach;
        }
      }
    }
  }
  if (attached && attachedLength > 1e-6) return attached;
  const box = bounds(parts),
    corners: Vec3[] = Array.from(
      { length: 8 },
      (_, i) => [0, 1, 2].map((j) => (i & (1 << j) ? box.max[j] : box.min[j])) as Vec3,
    );
  if (!longest || longestLength < 1e-6) {
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    longest = axes.sort(
      (a, b) =>
        projectedLength(b) * Math.abs(dot(sub(box.max, box.min), b)) -
        projectedLength(a) * Math.abs(dot(sub(box.max, box.min), a)),
    )[0];
    if (projectedLength(longest) < 1e-6) longest = axes.find((a) => projectedLength(a) > 1e-6)!;
  }
  // CAD edge orientation is arbitrary. Keep center-line defaults deterministic.
  if ((longest.find((n) => Math.abs(n) > 1e-6) ?? 1) < 0) longest = scale(longest, -1);
  let low = Infinity,
    high = -Infinity;
  const extend = (point: Vec3) => {
    const d = dot(sub(point, pivot), longest!);
    low = Math.min(low, d);
    high = Math.max(high, d);
  };
  for (const mesh of geometry)
    for (let i = 0; i < mesh.vertices.length; i += 3)
      extend([mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]]);
  if (!Number.isFinite(high)) corners.forEach(extend);
  const reach = high > 1e-6 ? high : low < -1e-6 ? low : 40;
  return add(pivot, scale(longest, reach));
}

// Angle changes redraw every pointer frame; do not rescan a dense CAD mesh then.
export function createRotationGripResolver() {
  let previous: { key: string; bodies: Body[]; meshes: BodyMesh[]; point: Vec3 } | undefined;
  return (rotation: Rotation, bodies: Body[], meshes: BodyMesh[]): Vec3 => {
    if (rotation.grip && rotationDirection(rotation.grip, rotation.pivot, rotation.axis))
      return rotation.grip;
    const key = JSON.stringify([rotation.ids, rotation.pivot, rotation.axis]);
    if (previous?.key === key && previous.bodies === bodies && previous.meshes === meshes)
      return previous.point;
    const point = defaultRotationGrip(rotation, bodies, meshes);
    previous = { key, bodies, meshes, point };
    return point;
  };
}
