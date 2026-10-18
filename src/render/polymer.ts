import type { MaterialPreset } from '../model/materials';
import { facadeNoise } from './facade';

type Finish = NonNullable<MaterialPreset['polymer']>;

/** Periodic height and micrograin share a scale; colour is deliberately almost uniform. */
export function polymerSample(finish: Finish, u: number, v: number, seed: number) {
  const grain = facadeNoise(u, v, 96, 96, seed + 1);
  const texture = facadeNoise(
    u,
    v,
    finish === 'pebbled' ? 48 : 64,
    finish === 'pebbled' ? 48 : 64,
    seed,
  );
  const height =
    finish === 'ribbed'
      ? (0.5 + 0.5 * Math.cos(u * Math.PI * 12)) ** 3 * 0.9 + grain * 0.1
      : finish === 'pebbled'
        ? texture * texture * (3 - 2 * texture) * 0.9 + grain * 0.1
        : texture * 0.7 + grain * 0.3;
  return { height, grain };
}

export function polymerPixels(finish: Finish, seed: number, size = 512) {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(color.length);
  const roughness = new Uint8ClampedArray(color.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sample = polymerSample(finish, x / size, y / size, seed),
        i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        color[i + c] = 248 + sample.grain * 7;
        height[i + c] = sample.height * 255;
        // Multiply the chosen finish by a restrained texture. Never turn rubber metallic.
        roughness[i + c] = 230 + (1 - sample.height * 0.6 + sample.grain * 0.1) * 25;
      }
      color[i + 3] = height[i + 3] = roughness[i + 3] = 255;
    }
  return { color, height, roughness };
}

export function polymerCanvases(finish: Finish, seed: number) {
  const size = 512,
    pixels = polymerPixels(finish, seed, size);
  const canvas = (data: Uint8ClampedArray) => {
    const result = document.createElement('canvas');
    result.width = result.height = size;
    const image = result.getContext('2d')!.createImageData(size, size);
    image.data.set(data);
    result.getContext('2d')!.putImageData(image, 0, 0);
    return result;
  };
  return {
    color: canvas(pixels.color),
    height: canvas(pixels.height),
    roughness: canvas(pixels.roughness),
  };
}
