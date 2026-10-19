import { expect, it } from 'vitest';
import { newSurfaceLayer } from '../model/surfaceLayers';
import { composeLayerPixels, layerSample, type LayerInput } from './layerPixels';
import type { SampleTexture } from '../surface/bake';
const sample = (pixels: number[], width = 1): SampleTexture => ({
  width,
  height: 1,
  pixels: new Uint8ClampedArray(pixels),
  srgb: true,
  flipY: true,
  wrapS: 1001,
  wrapT: 1001,
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
});
const input = (): LayerInput => ({
  domain: { x: 0, y: 0, width: 200, height: 100 },
  width: 20,
  height: 10,
  layers: [],
  color: [0.1, 0.1, 0.1],
  roughness: 0.2,
  metalness: 1,
  clearcoat: 0.4,
  transmission: 0,
  normalScale: [1, 1],
  maps: {},
  masks: {},
});

it('samples transparent lettering without black fringes and clips the exact decal footprint', () => {
  const t = sample([255, 0, 0, 255, 0, 0, 0, 0], 2);
  const filtered = layerSample(t, 0.5, 0.5, [], 0, true);
  expect(filtered).toEqual([1, 0, 0, 0.5]);
  const base = input(),
    layer = {
      ...newSurfaceLayer('decal'),
      center: [100, 50] as [number, number],
      width: 100,
      height: 60,
      roughness: 0.9,
    };
  const clean = composeLayerPixels(base);
  const result = composeLayerPixels({
    ...base,
    layers: [layer],
    decals: { [layer.id]: sample([255, 0, 0, 255]) },
  });
  const at = (x: number, y: number) => (y * base.width + x) * 4;
  expect(result.color.slice(0, 4)).toEqual(clean.color.slice(0, 4));
  expect([...result.color.slice(at(10, 5), at(10, 5) + 4)]).toEqual([255, 0, 0, 255]);
  expect(result.surface[at(10, 5) + 2]).toBe(0); // Ink is dielectric over metal.
  expect(Math.abs(result.surface[at(10, 5) + 1] - 229.5)).toBeLessThanOrEqual(0.5);
  expect(result.surface[2]).toBe(255);
  const worn = composeLayerPixels({
    ...base,
    layers: [{ ...layer, wear: 1 }],
    decals: { [layer.id]: t },
  });
  expect(worn.color).toEqual(clean.color);
});

it('manual paint wear exposes the substrate only under strokes and dust composes over lettering', () => {
  const base = input(),
    layer = {
      ...newSurfaceLayer('paint'),
      maskMode: 'manual' as const,
      amount: 1,
      color: '#ffffff',
    };
  const mask = new Uint8ClampedArray(base.width * base.height * 4);
  mask[(4 * base.width + 8) * 4 + 3] = 255;
  const result = composeLayerPixels({
    ...base,
    layers: [layer],
    paintedMasks: {
      [layer.id]: { ...sample([]), width: base.width, height: base.height, pixels: mask },
    },
  });
  expect(result.surface[2]).toBe(0);
  expect(result.color[0]).toBe(255);
  expect(result.surface[(4 * base.width + 8) * 4 + 2]).toBe(255);
  const decal = {
    ...newSurfaceLayer('decal'),
    width: 200,
    height: 100,
    center: [100, 50] as [number, number],
  };
  const dust = { ...newSurfaceLayer('dust'), amount: 1, color: '#443311' };
  const decals = { [decal.id]: sample([255, 255, 255, 255]) };
  const above = composeLayerPixels({ ...base, layers: [decal, dust], decals });
  const below = composeLayerPixels({ ...base, layers: [dust, decal], decals });
  expect(above.color[0]).toBeLessThan(below.color[0]);
  expect(below.color[0]).toBe(255);
});

it('painted scratches stay inside the brush mask and combine with automatic scratches', () => {
  const base = input();
  const layer = { ...newSurfaceLayer('scratches'), amount: 0.3 };
  const at = (4 * base.width + 8) * 4;
  const pixels = new Uint8ClampedArray(base.width * base.height * 4);
  pixels[at + 3] = 255;
  const common = {
    ...base,
    masks: { scratches: { mask: sample([255, 255, 255, 255]) } },
    paintedMasks: {
      [layer.id]: { ...sample([]), width: base.width, height: base.height, pixels },
    },
  };
  const clean = composeLayerPixels(base);
  const manual = composeLayerPixels({
    ...common,
    layers: [{ ...layer, maskMode: 'manual' }],
  });
  expect(manual.color.slice(0, 4)).toEqual(clean.color.slice(0, 4));
  expect(manual.surface.slice(0, 4)).toEqual(clean.surface.slice(0, 4));
  expect(manual.surface[at + 1]).toBeGreaterThan(clean.surface[at + 1]);
  const automatic = composeLayerPixels({ ...common, layers: [layer] });
  const combined = composeLayerPixels({
    ...common,
    layers: [{ ...layer, maskMode: 'combined' }],
  });
  expect(combined.surface.slice(0, 4)).toEqual(automatic.surface.slice(0, 4));
  expect(combined.surface[at + 1]).toBeGreaterThan(automatic.surface[at + 1]);
});
