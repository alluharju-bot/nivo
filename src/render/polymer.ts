import type { MaterialPreset } from '../model/materials';
import { facadeNoise } from './facade';

type Finish = NonNullable<MaterialPreset['polymer']>;

/** Periodic height and micrograin share a scale; colour is deliberately almost uniform. */
export function polymerSample(finish: Finish, u: number, v: number, seed: number) {
  const grain = facadeNoise(u, v, 96, 96, seed + 1);
  if (finish === 'carbon') {
    // Two-over/two-under twill with alternating fiber direction; the full tile is periodic.
    const tu = (((u * 8) % 1) + 1) % 1,
      tv = (((v * 8) % 1) + 1) % 1;
    const over = (((Math.floor(u * 8) - Math.floor(v * 8)) % 4) + 4) % 4 < 2;
    const across = over ? tu : tv;
    const bundle = Math.sin(across * Math.PI) ** 0.5;
    const strands = 0.5 + 0.5 * Math.cos(across * Math.PI * 16);
    return { height: bundle * 0.65 + strands * 0.25 + grain * 0.1, grain };
  }
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
        color[i + c] =
          finish === 'carbon' ? 26 + sample.height * 28 + sample.grain * 4 : 248 + sample.grain * 7;
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
