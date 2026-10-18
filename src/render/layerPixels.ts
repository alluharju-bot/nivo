import type { SurfaceLayer } from '../model/surfaceLayers';
import type { SampleTexture } from '../surface/bake';
import { facadeNoise } from './facade';
import { paintCoverage } from './paintWear';
export type LayerDomain = { x: number; y: number; width: number; height: number };
export type LayerInput = {
  domain: LayerDomain;
  width: number;
  height: number;
  layers: SurfaceLayer[];
  color: number[];
  roughness: number;
  metalness: number;
  clearcoat: number;
  transmission: number;
  normalScale: number[];
  maps: Partial<Record<'color' | 'normal' | 'roughness' | 'metalness', SampleTexture>>;
  masks: Partial<Record<SurfaceLayer['kind'], { mask: SampleTexture; normal?: SampleTexture }>>;
};
export type LayerPixels = Record<'color' | 'normal' | 'surface', Uint8ClampedArray>;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const linear = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
const srgb = (n: number) =>
  n <= 0.0031308 ? n * 12.92 : 1.055 * Math.max(0, n) ** (1 / 2.4) - 0.055;
function wrapped(n: number, size: number, mode: number) {
  if (mode === 1000) return ((n % size) + size) % size;
  if (mode === 1002) {
    const t = ((n % (size * 2)) + size * 2) % (size * 2);
    return Math.min(size - 1, t < size ? t : size * 2 - 1 - t);
  }
  return Math.max(0, Math.min(size - 1, n));
}
/** Bilinear sampling in linear light. Normal/data maps never pass through sRGB. */
export function layerSample(
  t: SampleTexture | undefined,
  u: number,
  v: number,
  out: number[],
  fallback = 1,
) {
  if (!t) {
    out[0] = out[1] = out[2] = fallback;
    return out;
  }
  const m = t.matrix;
  let x = (m[0] * u + m[3] * v + m[6]) * t.width - 0.5;
  let y = m[1] * u + m[4] * v + m[7];
  y = (t.flipY ? 1 - y : y) * t.height - 0.5;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const p = (dx: number, dy: number, c: number) => {
    const n =
      t.pixels[
        (wrapped(iy + dy, t.height, t.wrapT) * t.width + wrapped(ix + dx, t.width, t.wrapS)) * 4 + c
      ] / 255;
    return t.srgb ? linear(n) : n;
  };
  for (let c = 0; c < 3; c++)
    out[c] = mix(mix(p(0, 0, c), p(1, 0, c), fx), mix(p(0, 1, c), p(1, 1, c), fx), fy);
  return out;
}
/** One finite mark is feathered before clipping; cover patterns repeat. */
export function layerCoordinates(layer: SurfaceLayer, u: number, v: number) {
  const angle = (layer.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const x = u - (layer.center?.[0] ?? 0),
    y = v - (layer.center?.[1] ?? 0);
  const a = (c * x + s * y) / layer.width,
    b = (-s * x + c * y) / layer.height;
  const edge = layer.center ? clamp((0.5 - Math.max(Math.abs(a), Math.abs(b))) * 12) : 1;
  return [a + (layer.center ? 0.5 : 0), b + (layer.center ? 0.5 : 0), edge] as const;
}
function procedural(kind: SurfaceLayer['kind'], u: number, v: number, seed: number) {
  const n = (scale: number, salt = 0) => facadeNoise(u, v, scale, scale, seed + salt);
  if (kind === 'dust') return clamp((n(4) * 0.5 + n(13, 1) * 0.3 + n(83, 2) * 0.2 - 0.15) * 1.3);
  // A mineral ring plus a faint dried film; neutral height, not an embossed sticker.
  const x = (((u % 1) + 1) % 1) - 0.5,
    y = (((v % 1) + 1) % 1) - 0.5;
  const r = Math.hypot(x * 1.06, y),
    wave = n(17) * 0.012;
  return clamp(
    Math.exp(-(((r - 0.29 + wave) / 0.018) ** 2)) * (0.4 + n(29, 2) * 0.6) +
      (r < 0.29 ? n(11, 3) * 0.13 : 0),
  );
}
export function composeLayerPixels(input: LayerInput): LayerPixels {
  const { width, height, domain, maps } = input;
  const output = Object.fromEntries(
    ['color', 'normal', 'surface'].map((k) => [k, new Uint8ClampedArray(width * height * 4)]),
  ) as LayerPixels;
  const layers = input.layers
    .filter((l) => l.enabled && (l.kind === 'paint' ? l.amount < 1 : l.amount > 0))
    .map((l) => ({
      ...l,
      tint: [1, 3, 5].map((i) => linear(parseInt(l.color.slice(i, i + 2), 16) / 255)),
      coverage: l.kind === 'paint' ? new Float32Array(width * height) : undefined,
    }));
  const du = domain.width / width,
    dv = domain.height / height;
  for (const layer of layers) {
    if (!layer.coverage) continue;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const u = domain.x + (x + 0.5) * du,
          v = domain.y + domain.height - (y + 0.5) * dv;
        layer.coverage[y * width + x] =
          layerCoordinates(layer, u, v)[2] * paintCoverage(layer, u, v, Math.max(du, dv));
      }
  }
  const col = [1, 1, 1],
    norm = [0.5, 0.5, 1],
    data = [1, 1, 1],
    mask = [0, 0, 0];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = domain.x + ((x + 0.5) / width) * domain.width;
      const v = domain.y + (1 - (y + 0.5) / height) * domain.height;
      layerSample(maps.color, u, v, col);
      for (let c = 0; c < 3; c++) col[c] *= input.color[c];
      layerSample(maps.roughness, u, v, data);
      let rough = data[1] * input.roughness;
      layerSample(maps.metalness, u, v, data);
      let metal = data[2] * input.metalness;
      let coat = 1;
      if (maps.normal) layerSample(maps.normal, u, v, norm);
      else {
        norm[0] = norm[1] = 0.5;
        norm[2] = 1;
      }
      let nx = (norm[0] * 2 - 1) * input.normalScale[0],
        ny = (norm[1] * 2 - 1) * input.normalScale[1],
        nz = norm[2] * 2 - 1;
      // Maps are rebaked into unrotated UVs: carry the source tangent direction with them.
      if (maps.normal) {
        const m = maps.normal.matrix,
          ax = Math.hypot(m[0], m[3]) || 1,
          ay = Math.hypot(m[1], m[4]) || 1;
        const a = nx;
        nx = (m[0] / ax) * a + (m[1] / ay) * ny;
        ny = (m[3] / ax) * a + (m[4] / ay) * ny;
      }
      for (const layer of layers) {
        if (layer.coverage) {
          const coverage = layer.coverage[y * width + x];
          for (let c = 0; c < 3; c++) col[c] = mix(col[c], layer.tint[c], coverage);
          rough = mix(rough, layer.roughness ?? 0.65, coverage);
          metal *= 1 - coverage;
          // Opaque dielectric paint also masks the substrate's coat and transmission.
          coat *= 1 - coverage;
          nx *= 1 - coverage * 0.8;
          ny *= 1 - coverage * 0.8;
          const at = (a: number, b: number) =>
            layer.coverage![
              Math.max(0, Math.min(height - 1, b)) * width + Math.max(0, Math.min(width - 1, a))
            ];
          // A thin paint film, not displaced geometry. Derivatives use physical millimetres.
          nx -= ((at(x + 1, y) - at(x - 1, y)) * 0.08) / (2 * du);
          ny -= ((at(x, y - 1) - at(x, y + 1)) * 0.08) / (2 * dv);
          continue;
        }
        const [lu, lv, edge] = layerCoordinates(layer, u, v);
        if (!edge) continue;
        const source = input.masks[layer.kind];
        const amount =
          edge *
          layer.amount *
          (source
            ? layerSample(source.mask, lu, lv, mask)[0]
            : procedural(layer.kind, lu, lv, layer.seed));
        if (!amount) continue;
        const dust = layer.kind === 'dust',
          scratch = layer.kind === 'scratches',
          water = layer.kind === 'water';
        const opacity = amount * (dust ? 0.75 : water ? 0.15 : scratch ? 0.08 : 0.025);
        for (let c = 0; c < 3; c++) col[c] = mix(col[c], layer.tint[c], opacity);
        rough = mix(
          rough,
          dust
            ? 0.98
            : scratch
              ? Math.max(rough, 0.6)
              : water
                ? Math.max(rough, 0.5)
                : Math.max(rough, 0.38),
          amount,
        );
        metal *= 1 - opacity;
        coat *= 1 - amount * (dust ? 0.95 : 0.5);
        if (source?.normal) {
          layerSample(source.normal, lu, lv, data);
          const angle = (layer.rotation * Math.PI) / 180,
            a = (data[0] * 2 - 1) * amount * 0.45,
            b = (data[1] * 2 - 1) * amount * 0.45;
          nx += Math.cos(angle) * a - Math.sin(angle) * b;
          ny += Math.sin(angle) * a + Math.cos(angle) * b;
        }
      }
      const i = (y * width + x) * 4,
        length = Math.hypot(nx, ny, nz) || 1;
      for (let c = 0; c < 3; c++) output.color[i + c] = srgb(clamp(col[c])) * 255;
      output.normal[i] = ((nx / length) * 0.5 + 0.5) * 255;
      output.normal[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      output.normal[i + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      output.surface[i] = coat * 255;
      output.surface[i + 1] = clamp(rough) * 255;
      output.surface[i + 2] = clamp(metal) * 255;
      for (const pixels of Object.values(output)) pixels[i + 3] = 255;
    }
  return output;
}
