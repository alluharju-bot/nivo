import type { Axis, Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { dot, sub } from '../model/geometry';
import { Camera, Matrix4, Ray, Triangle, Vector3, Vector4 } from 'three';
import type { CadFace } from '../cad/protocol';

export function cylinderHit(ray: Ray, surface: NonNullable<CadFace['cylinder']>, near: Vector3) {
  const axis = new Vector3(...surface.axis),
    center = new Vector3(...surface.origin);
  const delta = ray.origin.clone().sub(center);
  const u = ray.direction.clone().addScaledVector(axis, -ray.direction.dot(axis));
  const v = delta.clone().addScaledVector(axis, -delta.dot(axis));
  const a = u.lengthSq(),
    b = 2 * u.dot(v),
    c = v.lengthSq() - surface.radius * surface.radius;
  const d = b * b - 4 * a * c;
  if (a < 1e-12 || d < 0) return;
  const points = [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)]
    .filter((t) => t >= 0)
    .map((t) => ray.at(t, new Vector3()));
  const point = points.sort((p, q) => p.distanceToSquared(near) - q.distanceToSquared(near))[0];
  if (!point) return;
  const normal = point.clone().sub(center);
  normal.addScaledVector(axis, -normal.dot(axis)).normalize().multiplyScalar(surface.sign);
  return { point: point.toArray() as Vec3, normal: normal.toArray() as Vec3 };
}

/** A screen interpolation parameter is not a world parameter in perspective.
 * Clip at the near/far planes first, then undo the perspective divide. */
export function projectedSegmentPoint(
  a: Vec3,
  b: Vec3,
  camera: Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
) {
  const p = new Vector4(...a, 1).applyMatrix4(matrix),
    q = new Vector4(...b, 1).applyMatrix4(matrix);
  let lo = 0,
    hi = 1;
  for (const [start, end] of [
    [p.w + p.z, q.w + q.z],
    [p.w - p.z, q.w - q.z],
  ]) {
    if (start < 0 && end < 0) return;
    if (start < 0) lo = Math.max(lo, start / (start - end));
    if (end < 0) hi = Math.min(hi, start / (start - end));
  }
  if (lo > hi) return;
  const u = p.clone().lerp(q, lo),
    v = p.clone().lerp(q, hi);
  if (u.w <= 0 || v.w <= 0) return;
  const px = ((u.x / u.w + 1) * width) / 2,
    py = ((1 - u.y / u.w) * height) / 2;
  const dx = ((v.x / v.w - u.x / u.w) * width) / 2,
    dy = (-(v.y / v.w - u.y / u.w) * height) / 2;
  const screenT = Math.max(
    0,
    Math.min(1, ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy || 1)),
  );
  const t = lo + ((hi - lo) * screenT * u.w) / ((1 - screenT) * v.w + screenT * u.w);
  const point = new Vector3(...a).lerp(new Vector3(...b), t);
  return {
    point: point.toArray() as Vec3,
    distance: Math.hypot(x - px - screenT * dx, y - py - screenT * dy),
    depth: point.clone().project(camera).z,
  };
}

/** At most two screen pixels of preference: precise aiming still wins. */
export function cameraSnapPenalty(points: { point: Vec3 }[], camera: Camera) {
  const position = camera.getWorldPosition(new Vector3());
  const distances = points.map((p) => position.distanceTo(new Vector3(...p.point)));
  const min = Math.min(...distances),
    span = Math.max(...distances) - min;
  return (point: Vec3) =>
    span > 1e-5 ? (2 * (position.distanceTo(new Vector3(...point)) - min)) / span : 0;
}

/** Only faces that actually contain the anchor participate, including inner cabinet faces. */
export function contextualFace(mesh: BodyMesh, point: Vec3, towardCamera: Vec3, through?: Vec3) {
  const tolerance = Math.max(1e-4, ...point.map((n) => Math.abs(n) * 1e-7));
  const p = new Vector3(...point),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const triangle = new Triangle(a, b, c),
    closest = new Vector3();
  const end = through && new Vector3(...through);
  const candidates = mesh.faces
    .flatMap((face) => {
      if (
        !face.planar ||
        Math.abs(dot(sub(point, face.center), face.normal)) > tolerance ||
        (through && Math.abs(dot(sub(through, face.center), face.normal)) > tolerance)
      )
        return [];
      let contains = false,
        containsEnd = !end,
        area = 0;
      for (let i = face.start; i < face.start + face.count; i += 3) {
        a.fromArray(mesh.vertices, mesh.triangles[i] * 3);
        b.fromArray(mesh.vertices, mesh.triangles[i + 1] * 3);
        c.fromArray(mesh.vertices, mesh.triangles[i + 2] * 3);
        area += triangle.getArea();
        if (triangle.closestPointToPoint(p, closest).distanceToSquared(p) < tolerance * tolerance)
          contains = true;
        if (
          end &&
          triangle.closestPointToPoint(end, closest).distanceToSquared(end) < tolerance * tolerance
        )
          containsEnd = true;
      }
      return contains && containsEnd
        ? [{ face, area, facing: dot(face.normal, towardCamera) }]
        : [];
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
