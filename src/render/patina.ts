/** Nivo's procedural copper patina. The same oxidation mask drives all channels. */
export function patinaPixels(size = 256, seed = 1) {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(color.length);
  const roughness = new Uint8ClampedArray(color.length);
  const metalness = new Uint8ClampedArray(color.length);
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
      const oxide = smooth(Math.max(0, Math.min(1, (cloud - 0.33) / 0.28)));
      const fine = noise(u, v, 128);
      const shade = 0.77 + fine * 0.13 + noise(u, v, 8) * 0.1;
      const copper = [202, 137, 94],
        green = [91, 162, 139];
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        color[i + c] = (copper[c] * (1 - oxide) + green[c] * oxide) * shade;
        height[i + c] = 30 + oxide * 150 + fine * 50;
        roughness[i + c] = (0.3 + oxide * 0.59 + fine * 0.05) * 255;
        // The oxidized coating is a dielectric; only exposed copper stays metallic.
        metalness[i + c] = (1 - oxide) * 255;
      }
      for (const channel of [color, height, roughness, metalness]) channel[i + 3] = 255;
    }
  return { color, height, roughness, metalness };
}

export function patinaCanvases(seed = 1) {
  const pixels = patinaPixels(256, seed);
  const canvas = (data: Uint8ClampedArray) => {
    const result = document.createElement('canvas');
    result.width = result.height = 256;
    const context = result.getContext('2d')!;
    const image = context.createImageData(256, 256);
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
