import type { Appearance } from '../model/materials';
import { normalPixels } from './surfaceMaps';

export type FacadeSettings = NonNullable<Appearance['procedural']>;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (n: number, size: number) => ((n % size) + size) % size;
function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Periodic value noise; both value and slope agree across the repeat boundary. */
export function facadeNoise(u: number, v: number, nx: number, ny: number, seed: number) {
  const x = mod(u, 1) * nx,
    y = mod(v, 1) * ny;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const at = (dx: number, dy: number) => hash(mod(ix + dx, nx), mod(iy + dy, ny), seed);
  return mix(
    mix(at(0, 0), at(1, 0), smooth(x - ix)),
    mix(at(0, 1), at(1, 1), smooth(x - ix)),
    smooth(y - iy),
  );
}
/** Large colour variation never becomes large bumps. Fine physical relief is a separate map. */
export function facadePixels(
  settings: FacadeSettings,
  kind: 'concrete' | 'plaster',
  depth: number,
  colorSize = 1024,
  detailSize = 512,
) {
  const color = new Uint8ClampedArray(colorSize * colorSize * 4);
  const roughness = new Uint8ClampedArray(color.length);
  for (let y = 0; y < colorSize; y++)
    for (let x = 0; x < colorSize; x++) {
      const u = x / colorSize,
        v = y / colorSize;
      const n = (nx: number, ny = nx, salt = 0) => facadeNoise(u, v, nx, ny, settings.seed + salt);
      const broad = 0.6 * n(3) + 0.28 * n(11, 11, 1) + 0.12 * n(41, 41, 2);
      // Optional generic vertical weathering, not a simulation of runoff from modelled windows.
      const streak = Math.max(0, n(93, 3, 3) - 0.45) * n(13, 7, 4);
      const shade =
        255 -
        settings.variation * (10 + broad * (kind === 'concrete' ? 65 : 35)) -
        settings.weathering * streak * 140;
      const i = (y * colorSize + x) * 4;
      color[i] = color[i + 1] = color[i + 2] = shade;
      color[i + 3] = roughness[i + 3] = 255;
      roughness[i] = roughness[i + 1] = roughness[i + 2] = 245 + broad * 10;
    }
  const height = new Uint8ClampedArray(detailSize * detailSize * 4);
  for (let y = 0; y < detailSize; y++)
    for (let x = 0; x < detailSize; x++) {
      const u = x / detailSize,
        v = y / detailSize;
      const grain = facadeNoise(u, v, 100, 100, settings.seed + 8);
      const pores = facadeNoise(u, v, 44, 44, settings.seed + 9);
      const value =
        kind === 'concrete' ? 155 + grain * 35 - Math.max(0, pores - 0.65) * 420 : 50 + grain * 180;
      const i = (y * detailSize + x) * 4;
      height[i] = height[i + 1] = height[i + 2] = value;
      height[i + 3] = 255;
    }
  return {
    color,
    roughness,
    normal: normalPixels(height, detailSize, detailSize, {
      width: settings.detailSize,
      height: settings.detailSize,
      depth,
    }),
  };
}
export function facadeCanvases(
  settings: FacadeSettings,
  kind: 'concrete' | 'plaster',
  depth: number,
) {
  const pixels = facadePixels(settings, kind, depth);
  const canvas = (data: Uint8ClampedArray, size: number) => {
    const result = document.createElement('canvas');
    result.width = result.height = size;
    result
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
    return result;
  };
  return {
    color: canvas(pixels.color, 1024),
    roughness: canvas(pixels.roughness, 1024),
    normal: canvas(pixels.normal, 512),
  };
}
