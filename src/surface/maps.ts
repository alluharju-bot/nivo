import { Vector3 } from 'three';
import type { SurfaceMesh } from './mesh';
import type { BrushStamp } from './sculpt';
import { brushRegion, visibleFrom } from './topology';

export type MapChannel = 'color' | 'normal' | 'ao' | 'roughness' | 'metalness';
export interface PixelMap {
  size: number;
  pixels: Uint8ClampedArray;
}
export type SurfaceMaps = Partial<Record<MapChannel, PixelMap>>;
export const blankMap = (size: number, rgb: number[]): PixelMap => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([...rgb, 255], i);
  return { size, pixels };
};
/** Pixel rows are top-to-bottom; mesh UV v=0 is the bottom of the image. */
export function rasterTriangle(
  mesh: SurfaceMesh,
  t: number,
  size: number,
  visit: (pixel: number, weights: number[]) => void,
) {
  if (!mesh.uv) return;
  const ids = mesh.indices.slice(t * 3, t * 3 + 3),
    uv = ids.map((i) => [mesh.uv![i * 2] * size, (1 - mesh.uv![i * 2 + 1]) * size]);
  const [a, b, c] = uv,
    det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) < 1e-10) return;
  const minX = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0])))),
    maxX = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1])))),
    maxY = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const u = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / det;
      const v = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / det,
        w = 1 - u - v;
      if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) visit(y * size + x, [u, v, w]);
    }
}
export function interpolate(array: number[], ids: number[], w: number[], stride = 3) {
  return Array.from({ length: stride }, (_, k) =>
    ids.reduce((sum, id, i) => sum + array[id * stride + k] * w[i], 0),
  );
}
export function paintMap(
  mesh: SurfaceMesh,
  original: PixelMap,
  stamps: BrushStamp[],
  color: number[],
  opacity: number,
): PixelMap {
  if (!mesh.uv) throw new Error('Luo UV-kartta ennen maalaamista.');
  const next = { size: original.size, pixels: new Uint8ClampedArray(original.pixels) };
  const prepared = stamps.map((s) => ({
    ...s,
    region: brushRegion(mesh, s),
    visible: visibleFrom(mesh, s.camera),
  }));
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const ids = mesh.indices.slice(t * 3, t * 3 + 3),
      p = ids.map((i) => mesh.positions.slice(i * 3, i * 3 + 3));
    const near = prepared.filter(
      (s) =>
        (!s.region || s.region.has(t)) &&
        [0, 1, 2].every(
          (k) =>
            s.point[k] + s.radius >= Math.min(...p.map((v) => v[k])) &&
            s.point[k] - s.radius <= Math.max(...p.map((v) => v[k])),
        ),
    );
    if (!near.length) continue;
    rasterTriangle(mesh, t, original.size, (pixel, w) => {
      const point = interpolate(mesh.positions, ids, w),
        normal = new Vector3(...interpolate(mesh.normals, ids, w)).normalize();
      if (mesh.mask && ids.some((id, i) => mesh.mask![id] > 0 && w[i] > 1e-6)) return;
      for (const s of near) {
        if (normal.dot(new Vector3(...s.normal)) < 0.15) continue;
        const d = Math.hypot(...point.map((n, k) => n - s.point[k])) / s.radius;
        if (d >= 1 || !s.visible(point)) continue;
        const alpha = Math.min(1, Math.max(0, opacity)) * (1 - d * d) ** 2;
        for (let k = 0; k < 3; k++)
          next.pixels[pixel * 4 + k] = next.pixels[pixel * 4 + k] * (1 - alpha) + color[k] * alpha;
      }
    });
  }
  return next;
}
/** Extend island borders to prevent dark seams under bilinear filtering/mipmaps. */
export function dilateMaps(maps: SurfaceMaps, mask: Uint8Array, padding = 4) {
  const first = Object.values(maps)[0];
  if (!first) return;
  const size = first.size,
    filled = new Uint8Array(mask);
  for (let pass = 0; pass < padding; pass++) {
    const add: number[] = [];
    for (let p = 0; p < filled.length; p++) {
      if (filled[p]) continue;
      const x = p % size,
        candidates = [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size];
      const from = candidates.find((q) => q >= 0 && q < filled.length && filled[q]);
      if (from === undefined) continue;
      for (const map of Object.values(maps))
        for (let c = 0; c < 4; c++) map!.pixels[p * 4 + c] = map!.pixels[from * 4 + c];
      add.push(p);
    }
    add.forEach((p) => (filled[p] = 1));
  }
}
export function padPaintMap(mesh: SurfaceMesh, map: PixelMap): PixelMap {
  const mask = new Uint8Array(map.size * map.size);
  for (let t = 0; t < mesh.indices.length / 3; t++)
    rasterTriangle(mesh, t, map.size, (p) => {
      mask[p] = 1;
    });
  const next = { ...map, pixels: new Uint8ClampedArray(map.pixels) };
  dilateMaps({ color: next }, mask, 4);
  return next;
}
