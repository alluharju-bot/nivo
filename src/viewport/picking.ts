import type { Axis, Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { dot, sub } from '../model/geometry';
import { Triangle, Vector3 } from 'three';

/** Only faces that actually contain the anchor participate, including inner cabinet faces. */
export function contextualFace(mesh: BodyMesh, point: Vec3, towardCamera: Vec3) {
  const tolerance = Math.max(1e-4, ...point.map((n) => Math.abs(n) * 1e-7));
  const p = new Vector3(...point),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const triangle = new Triangle(a, b, c),
    closest = new Vector3();
  const candidates = mesh.faces
    .flatMap((face) => {
      if (!face.planar || Math.abs(dot(sub(point, face.center), face.normal)) > tolerance)
        return [];
      let contains = false,
        area = 0;
      for (let i = face.start; i < face.start + face.count; i += 3) {
        a.fromArray(mesh.vertices, mesh.triangles[i] * 3);
        b.fromArray(mesh.vertices, mesh.triangles[i + 1] * 3);
        c.fromArray(mesh.vertices, mesh.triangles[i + 2] * 3);
        area += triangle.getArea();
        if (triangle.closestPointToPoint(p, closest).distanceToSquared(p) < tolerance * tolerance)
          contains = true;
      }
      return contains ? [{ face, area, facing: dot(face.normal, towardCamera) }] : [];
    })
    .filter((c) => c.facing > 0.03);
  const maxArea = Math.max(1, ...candidates.map((c) => c.area));
  // Camera alignment dominates. Area only resolves nearly equal adjacent planes.
  return candidates.sort(
    (a, b) => b.facing + (0.04 * b.area) / maxArea - (a.facing + (0.04 * a.area) / maxArea),
  )[0]?.face;
}

/** Choose once from the initial screen gesture; camera-depth axes cannot win. */
export function moveAxisFromScreen(
  delta: [number, number],
  axes: [number, number][],
): Axis | undefined {
  if (Math.hypot(...delta) < 5) return;
  let best = -1,
    index = -1;
  axes.forEach(([x, y], i) => {
    const length = Math.hypot(x, y);
    if (length < 3) return;
    const score = Math.abs(delta[0] * x + delta[1] * y) / length;
    if (score > best) {
      best = score;
      index = i;
    }
  });
  return index < 0 ? undefined : (['x', 'y', 'z'] as const)[index];
}
