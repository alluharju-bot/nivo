import { expect, it } from 'vitest';
import { composeLayerPixels, layerCoordinates, layerSample, type LayerInput } from './layerPixels';
import { newSurfaceLayer } from '../model/surfaceLayers';
const input = (): LayerInput => ({
  domain: { x: 0, y: 0, width: 200, height: 200 },
  width: 32,
  height: 32,
  layers: [],
  color: [0.2, 0.3, 0.4],
  roughness: 0.1,
  metalness: 1,
  clearcoat: 0,
  transmission: 0,
  normalScale: [1, 1],
  maps: {},
  masks: {},
});
it('preserves the base in linear light and keeps dust separate from metallic reflection', () => {
  const base = input(),
    clean = composeLayerPixels(base),
    dirty = composeLayerPixels({ ...base, layers: [{ ...newSurfaceLayer('dust'), amount: 1 }] });
  expect(clean.surface[1]).toBe(26);
  expect(clean.surface[2]).toBe(255);
  expect(dirty.surface[1]).toBeGreaterThan(clean.surface[1]);
  expect(dirty.surface[2]).toBeLessThan(clean.surface[2]);
  expect(clean.color[0]).toBeCloseTo(124, 0);
  expect(dirty.color).not.toEqual(clean.color);
});
it('local marks never repeat beyond their footprint and hiding fully restores base', () => {
  const mark = {
    ...newSurfaceLayer('water'),
    width: 50,
    height: 50,
    center: [50, 50] as [number, number],
  };
  expect(layerCoordinates(mark, 150, 50)[2]).toBe(0);
  expect(layerCoordinates(mark, 50, 50)[2]).toBe(1);
  const base = input(),
    clean = composeLayerPixels(base),
    dirty = composeLayerPixels({ ...base, layers: [mark] });
  expect(dirty.color.slice(0, 4)).toEqual(clean.color.slice(0, 4));
  expect(dirty.color).not.toEqual(clean.color);
  expect(composeLayerPixels({ ...base, layers: [{ ...mark, enabled: false }] })).toEqual(clean);
});
it('preserves fine map contrast and samples clamped map edges without wrapping', () => {
  const texture = {
    width: 2,
    height: 1,
    pixels: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    flipY: true,
    wrapS: 1001,
    wrapT: 1001,
    srgb: true,
  };
  expect(layerSample(texture, 0.25, 0.5, [])[0]).toBe(0);
  expect(layerSample(texture, 0.75, 0.5, [])[0]).toBe(1);
  expect(layerSample(texture, 0.5, 0.5, [])[0]).toBeCloseTo(0.5);
  expect(layerSample(texture, -1, 0.5, [])[0]).toBe(0);
});
