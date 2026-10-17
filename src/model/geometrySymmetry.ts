import { Vector2 } from 'three';
import type { Vec3 } from './project';
import { dot, sub, unit } from './geometry';

const orient = (a: Vector2, b: Vector2, c: Vector2) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** A symmetric boundary deformation must not acquire an arbitrary diagonal
 * crease. Clip mirrored ears together. A quad spanning the symmetry plane is
 * planar (its two cross-axis edges are parallel), so either diagonal describes
 * the same symmetric surface. No new control points or mirror constraints are
 * introduced, and deliberately asymmetric edits keep the ordinary mesher.
 * Holes and interior control points are handled by the general triangulator. */
export function symmetricPatchTriangles(
  boundary: number[],
  before: Vec3[],
  after: Vec3[],
  projected: Map<number, Vector2>,
  displaced: Set<number>,
  tolerance: number,
): number[][] | undefined {
  const count = boundary.length;
  // Bound interactive work. Large/curved imported meshes use the general path.
  if (count > 512) return;
  const matches = (points: Vec3[], shift: number) => {
    const index = boundary.findIndex((_, i) => i !== (shift - i + count) % count);
    if (index < 0) return false;
    const a = points[boundary[index]],
      b = points[boundary[(shift - index + count) % count]],
      direction = sub(b, a);
    if (Math.hypot(...direction) < tolerance) return false;
    const normal = unit(direction),
      center = a.map((n, k) => (n + b[k]) / 2) as Vec3;
    return boundary.every((id, i) => {
      const p = points[id],
        q = points[boundary[(shift - i + count) % count]],
        distance = 2 * dot(sub(p, center), normal);
      return Math.hypot(...p.map((n, k) => n - distance * normal[k] - q[k])) < tolerance;
    });
  };
  for (let shift = 0; shift < count; shift++) {
    if (!matches(before, shift) || !matches(after, shift)) continue;
    const mirror = new Map(boundary.map((id, i) => [id, boundary[(shift - i + count) % count]]));
    const result = clip(boundary, mirror, projected, displaced);
    if (result) return result;
  }
}

function clip(
  boundary: number[],
  mirror: Map<number, number>,
  points: Map<number, Vector2>,
  displaced: Set<number>,
): number[][] | undefined {
  let loop = [...boundary];
  const result: number[][] = [];
  const at = (i: number) => loop[(i + loop.length) % loop.length];
  const signed = (t: number[]) => orient(points.get(t[0])!, points.get(t[1])!, points.get(t[2])!);
  // Use relative projected area tolerance, independent of world origin.
  const extent = Math.max(
      ...boundary.map((id) => points.get(id)!.distanceTo(points.get(boundary[0])!)),
    ),
    epsilon = Math.max(1e-12, extent * extent * 1e-12);
  const inside = (id: number, t: number[]) =>
    t.every(
      (a, j) => orient(points.get(a)!, points.get(t[(j + 1) % 3])!, points.get(id)!) >= -epsilon,
    );
  const valid = (triangles: number[][], vertices: number[]) =>
    triangles.every((t) => signed(t) > epsilon) &&
    loop.every((id) => vertices.includes(id) || !triangles.some((t) => inside(id, t)));
  while (loop.length > 3) {
    const candidates: {
      removed: number[];
      triangles: number[][];
      together?: number[];
      priority: number;
      shape: number;
    }[] = [];
    for (let i = 0; i < loop.length; i++) {
      const id = at(i),
        other = mirror.get(id)!,
        j = loop.indexOf(other);
      let removed: number[], triangles: number[][], together: number[] | undefined;
      if (j === i) {
        removed = [id];
        triangles = [[at(i - 1), id, at(i + 1)]];
      } else if (at(i + 1) === other) {
        // Remove a whole symmetric strip, never just one of its two ears.
        const quad = [at(i - 1), id, other, at(i + 2)];
        removed = loop.length === 4 ? [...loop] : [id, other];
        triangles = [
          [quad[0], quad[1], quad[2]],
          [quad[0], quad[2], quad[3]],
        ];
        together = quad;
      } else if (at(i - 1) !== other && loop.length > 4) {
        removed = [id, other];
        triangles = [
          [at(i - 1), id, at(i + 1)],
          [at(j - 1), other, at(j + 1)],
        ];
      } else continue;
      if (triangles.some((t) => signed(t) <= epsilon)) continue;
      const priority = removed.filter((id) => displaced.has(id)).length;
      const shape =
        triangles.reduce(
          (sum, t) =>
            sum +
            t.reduce(
              (s, id, k) => s + points.get(id)!.distanceToSquared(points.get(t[(k + 1) % 3])!),
              0,
            ) /
              signed(t),
          0,
        ) / triangles.length;
      candidates.push({ removed, triangles, together, priority, shape });
    }
    // Test containment only in preference order, avoiding cubic work on large
    // convex outlines while dragging a point or edge.
    candidates.sort((a, b) => b.priority - a.priority || a.shape - b.shape);
    const best = candidates.find((c) =>
      c.together ? valid(c.triangles, c.together) : c.triangles.every((t) => valid([t], t)),
    );
    if (!best) return;
    result.push(...best.triangles);
    loop = loop.filter((id) => !best.removed.includes(id));
  }
  if (loop.length === 3) {
    if (signed(loop) <= epsilon) return;
    result.push(loop);
  }
  return result;
}
