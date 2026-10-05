import { guidePoints } from '../model/guides';
import { add, sub, scale, unit } from '../model/geometry';
import { Matrix4, Vector4, type Camera } from 'three';
import type { Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
type Point2 = [number, number];
export type ScreenBounds = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  whole?: boolean;
  polygons?: Point2[][];
};

function clip<T>(
  polygon: T[],
  distance: (p: T) => number,
  interpolate: (a: T, b: T, t: number) => T,
) {
  const result: T[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = distance(a),
      db = distance(b);
    if (da <= 0) result.push(a);
    if (da > 0 !== db > 0) result.push(interpolate(a, b, da / (da - db)));
  }
  return result;
}

/** Project once when a box gesture begins; pointer moves only query cached 2D polygons. */
export function projectSelectionBounds(
  meshes: Pick<BodyMesh, 'id' | 'vertices' | 'edges' | 'triangles'>[],
  camera: Camera,
  width: number,
  height: number,
  sectionDistance?: (point: Vec3) => number,
): ScreenBounds[] {
  camera.updateMatrixWorld();
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const result: ScreenBounds[] = [];
  const toScreen = (p: Vector4): Point2 => [
    ((p.x / p.w + 1) * width) / 2,
    ((1 - p.y / p.w) * height) / 2,
  ];
  for (const mesh of meshes) {
    const vertices: Vec3[] = [],
      projected: Vector4[] = [];
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const p = mesh.vertices.slice(i, i + 3) as Vec3;
      vertices.push(p);
      projected.push(new Vector4(...p, 1).applyMatrix4(matrix));
    }
    const polygons: Point2[][] = [];
    let whole = true;
    if (mesh.triangles?.length) {
      for (let i = 0; i < mesh.triangles.length; i += 3) {
        const indices = mesh.triangles.slice(i, i + 3);
        let points = indices.map((index) => projected[index]);
        if (sectionDistance) {
          const world = clip(
            indices.map((index) => vertices[index]),
            sectionDistance,
            (a, b, t) => a.map((n, k) => n + (b[k] - n) * t) as Vec3,
          );
          points = world.map((p) => new Vector4(...p, 1).applyMatrix4(matrix));
        }
        if (!points.length) continue;
        if (points.some((p) => p.w <= 0 || Math.abs(p.z) > p.w)) {
          whole = false;
          for (const distance of [
            (p: Vector4) => 1e-9 - p.w,
            (p: Vector4) => -p.z - p.w,
            (p: Vector4) => p.z - p.w,
          ])
            points = clip(points, distance, (a, b, t) => a.clone().lerp(b, t));
        }
        if (points.length) polygons.push(points.map(toScreen));
      }
    } else if (mesh.edges?.length) {
      for (let i = 0; i < mesh.edges.length; i += 6) {
        let world = [mesh.edges.slice(i, i + 3) as Vec3, mesh.edges.slice(i + 3, i + 6) as Vec3];
        if (sectionDistance)
          world = clip(
            world,
            sectionDistance,
            (a, b, t) => a.map((n, k) => n + (b[k] - n) * t) as Vec3,
          );
        let points = world.map((p) => new Vector4(...p, 1).applyMatrix4(matrix));
        if (points.some((p) => p.w <= 0 || Math.abs(p.z) > p.w)) {
          whole = false;
          for (const distance of [
            (p: Vector4) => 1e-9 - p.w,
            (p: Vector4) => -p.z - p.w,
            (p: Vector4) => p.z - p.w,
          ])
            points = clip(points, distance, (a, b, t) => a.clone().lerp(b, t));
        }
        if (points.length) polygons.push(points.map(toScreen));
      }
    } else {
      // Degenerate/line-only meshes retain their visible segments.
      const shown = projected.filter(
        (p, i) => !sectionDistance || sectionDistance(vertices[i]) <= 1e-6,
      );
      whole = shown.every((p) => p.w > 0 && Math.abs(p.z) <= p.w);
      if (whole && shown.length) polygons.push(shown.map(toScreen));
    }
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const polygon of polygons)
      for (const [x, y] of polygon) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    if (Number.isFinite(left))
      result.push({ id: mesh.id, left, right, top, bottom, whole, polygons });
  }
  return result;
}

export function insideSelectionRect(
  bounds: ScreenBounds[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  crossing = false,
) {
  const left = Math.min(x1, x2) - 0.1,
    right = Math.max(x1, x2) + 0.1,
    top = Math.min(y1, y2) - 0.1,
    bottom = Math.max(y1, y2) + 0.1;
  return bounds
    .filter((b) => {
      if (!crossing)
        return (
          b.whole !== false &&
          b.left >= left &&
          b.right <= right &&
          b.top >= top &&
          b.bottom <= bottom
        );
      if (b.left > right || b.right < left || b.top > bottom || b.bottom < top) return false;
      if (!b.polygons) return true;
      // Bounding boxes alone would select empty cabinet openings and the corners of rotated parts.
      return b.polygons.some((polygon) => {
        let clipped = polygon;
        for (const distance of [
          (p: Point2) => left - p[0],
          (p: Point2) => p[0] - right,
          (p: Point2) => top - p[1],
          (p: Point2) => p[1] - bottom,
        ]) {
          clipped = clip(clipped, distance, (a, b, t): Point2 => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
          ]);
          if (!clipped.length) return false;
        }
        return true;
      });
    })
    .map((b) => b.id);
}

/** A guide's reference span can be enclosed; crossing also hits its rendered extension. */
export function projectGuideSelectionBounds(
  bodies: import('../model/project').Body[],
  guides: import('../model/project').Guide[],
  camera: Camera,
  width: number,
  height: number,
  crossing = false,
  sectionDistance?: (point: Vec3) => number,
) {
  const segments = guides.flatMap((guide) => {
    const points = guidePoints(bodies, guide);
    if (!points) return [];
    let [a, b] = points;
    if (crossing && guide.mode === 'guide') {
      const direction = unit(sub(b, a));
      a = add(a, scale(direction, -20000));
      b = add(b, scale(direction, 20000));
    }
    const edges = [...a, ...b];
    return [{ id: guide.id, vertices: edges, edges, triangles: [] }];
  });
  return projectSelectionBounds(segments, camera, width, height, sectionDistance);
}
