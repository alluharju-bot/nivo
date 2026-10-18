import type { MaterialPreset } from '../model/materials';

type Patina = NonNullable<MaterialPreset['patina']>;

/** The same seamless oxidation mask drives colour, relief and both PBR channels. */
export function patinaPixels(size = 256, seed = 1, finish: Patina = 'copper') {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(color.length);
  const roughness = new Uint8ClampedArray(color.length);
  const metalness = new Uint8ClampedArray(color.length);
  const base =
    finish === 'copper' ? [202, 137, 94] : finish === 'iron-black' ? [45, 48, 51] : [143, 147, 150];
  const coating =
    finish === 'copper'
      ? [91, 162, 139]
      : finish === 'iron-polished'
        ? [64, 54, 46]
        : finish === 'iron-black'
          ? [29, 31, 34]
          : [146, 69, 30];
  // Sparse rust leaves most of the iron exposed; polished iron has broader,
  // subdued dark patina. Keep the established copper surface unchanged.
  const threshold = finish === 'iron-rust' ? 0.56 : finish === 'iron-polished' ? 0.38 : 0.33;
  const span = finish === 'iron-rust' ? 0.14 : finish === 'iron-polished' ? 0.3 : 0.28;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (u: number, v: number, cells: number) => {
    const x = u * cells,
      y = v * cells;
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const hash = (a: number, b: number) => {
      // Periodic lattice: the colour, relief and masks tile together.
      const n =
        Math.sin(
          (((a % cells) + cells) % cells) * 127.1 +
            (((b % cells) + cells) % cells) * 311.7 +
            seed * 73.1,
        ) * 43758.5453;
      return n - Math.floor(n);
    };
    const fx = smooth(x - ix),
      fy = smooth(y - iy);
    const a = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
    const b = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const cloud = noise(u, v, 4) * 0.55 + noise(u, v, 16) * 0.3 + noise(u, v, 64) * 0.15;
      const oxide = smooth(Math.max(0, Math.min(1, (cloud - threshold) / span)));
      const fine = noise(u, v, 128);
      const shade = 0.77 + fine * 0.13 + noise(u, v, 8) * 0.1;
      let rough = 0.3 + oxide * 0.59 + fine * 0.05;
      let metal = 1 - oxide;
      let relief = 30 + oxide * 150 + fine * 50;
      if (finish === 'iron-rust') {
        rough = 0.38 + oxide * 0.5 + fine * 0.06;
        relief = 65 + oxide * 110 + fine * (10 + oxide * 35);
      } else if (finish === 'iron-polished') {
        rough = 0.17 + oxide * 0.25 + fine * 0.025;
        metal = 1 - oxide * 0.6;
        relief = 85 + oxide * 45 + fine * 12;
      } else if (finish === 'iron-black') {
        rough = 0.43 + oxide * 0.13 + fine * 0.045;
        metal = 0.65 - oxide * 0.2;
        relief = 95 + oxide * 25 + fine * 18;
      }
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        color[i + c] = (base[c] * (1 - oxide) + coating[c] * oxide) * shade;
        height[i + c] = relief;
        roughness[i + c] = rough * 255;
        // Rust/patina is less metallic than the exposed metal underneath.
        metalness[i + c] = metal * 255;
      }
      for (const channel of [color, height, roughness, metalness]) channel[i + 3] = 255;
    }
  return { color, height, roughness, metalness };
}

export function patinaCanvases(seed = 1, finish: Patina = 'copper') {
  const size = finish === 'copper' ? 256 : 512;
  const pixels = patinaPixels(size, seed, finish);
  const canvas = (data: Uint8ClampedArray) => {
    const result = document.createElement('canvas');
    result.width = result.height = size;
    const context = result.getContext('2d')!;
    const image = context.createImageData(size, size);
    image.data.set(data);
    context.putImageData(image, 0, 0);
    return result;
  };
  return {
    color: canvas(pixels.color),
    height: canvas(pixels.height),
    roughness: canvas(pixels.roughness),
    metalness: canvas(pixels.metalness),
  };
}
