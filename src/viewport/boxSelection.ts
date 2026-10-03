import { Matrix4, Vector4, type Camera } from 'three';
import type { BodyMesh } from '../cad/protocol';
export type ScreenBounds = { id: string; left: number; right: number; top: number; bottom: number };
export function projectSelectionBounds(
  meshes: BodyMesh[],
  camera: Camera,
  width: number,
  height: number,
): ScreenBounds[] {
  camera.updateMatrixWorld();
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const point = new Vector4(),
    result: ScreenBounds[] = [];
  for (const mesh of meshes) {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity,
      clipped = false;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      point
        .set(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2], 1)
        .applyMatrix4(matrix);
      // A body crossing the near/far plane cannot be wholly inside the visible rectangle.
      if (point.w <= 0 || Math.abs(point.z) > point.w) {
        clipped = true;
        break;
      }
      const x = ((point.x / point.w + 1) * width) / 2,
        y = ((1 - point.y / point.w) * height) / 2;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    if (!clipped && Number.isFinite(left)) result.push({ id: mesh.id, left, right, top, bottom });
  }
  return result;
}
export function insideSelectionRect(
  bounds: ScreenBounds[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const left = Math.min(x1, x2),
    right = Math.max(x1, x2),
    top = Math.min(y1, y2),
    bottom = Math.max(y1, y2);
  return bounds
    .filter(
      (b) =>
        b.left >= left - 0.1 &&
        b.right <= right + 0.1 &&
        b.top >= top - 0.1 &&
        b.bottom <= bottom + 0.1,
    )
    .map((b) => b.id);
}
