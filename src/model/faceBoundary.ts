import type { BodyMesh, FaceTarget } from '../cad/protocol';
import type { Vec3 } from './project';
import { add, sub, dot, scale, unit } from './geometry';

/** Face boundary (including holes), excluding internal tessellation edges. */
export function offsetDirection(mesh: BodyMesh, target: FaceTarget): Vec3 {
  const face = mesh.faces.find((f) => f.ref === target.face);
  if (!face) return [1, 0, 0];
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = face.start; i < face.start + face.count; i += 3) {
    const triangle = mesh.triangles.slice(i, i + 3);
    triangle.forEach((a, j) => {
      const b = triangle[(j + 1) % 3],
        key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const old = edges.get(key);
      if (old) old.count++;
      else edges.set(key, { a, b, count: 1 });
    });
  }
  let nearest = Infinity,
    direction: Vec3 = [1, 0, 0];
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    const a = mesh.vertices.slice(edge.a * 3, edge.a * 3 + 3) as Vec3,
      b = mesh.vertices.slice(edge.b * 3, edge.b * 3 + 3) as Vec3,
      delta = sub(b, a),
      length2 = dot(delta, delta);
    if (length2 < 1e-10) continue;
    const t = Math.max(0, Math.min(1, dot(sub(target.point, a), delta) / length2));
    const closest = add(a, scale(delta, t)),
      inward = sub(target.point, closest);
    const distance = Math.hypot(...inward);
    if (distance >= nearest) continue;
    nearest = distance;
    // At an edge, use the perpendicular component pointing into the face.
    const fallback = sub(
      sub(face.center, closest),
      scale(delta, dot(sub(face.center, closest), delta) / length2),
    );
    direction = unit(distance > 1e-5 ? inward : fallback);
  }
  return direction;
}
