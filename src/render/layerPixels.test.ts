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

it('opaque paint has its own dielectric finish; full wear and hiding restore the exact substrate', () => {
  const base = input();
  base.maps.normal = {
    width: 1,
    height: 1,
    pixels: new Uint8ClampedArray([180, 130, 240, 255]),
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    flipY: true,
    wrapS: 1000,
    wrapT: 1000,
    srgb: false,
  };
  const paint = { ...newSurfaceLayer('paint'), color: '#2468a0', roughness: 0.8, amount: 0 };
  const clean = composeLayerPixels(base);
  const coated = composeLayerPixels({ ...base, layers: [paint] });
  for (let i = 0; i < coated.color.length; i += 4) {
    expect([...coated.color.slice(i, i + 3)]).toEqual([36, 104, 160]);
    expect([...coated.surface.slice(i, i + 3)]).toEqual([0, 204, 0]);
  }
  expect(coated.normal).not.toEqual(clean.normal);
  expect(composeLayerPixels({ ...base, layers: [{ ...paint, amount: 1 }] })).toEqual(clean);
  expect(composeLayerPixels({ ...base, layers: [{ ...paint, enabled: false }] })).toEqual(clean);
});

it('wear uses one correlated mask for colour, roughness, metal and coating; it is stable and monotonic', () => {
  const base = input(),
    paint = { ...newSurfaceLayer('paint'), color: '#ffffff', amount: 0.5, chipSize: 30 };
  const worn = composeLayerPixels({ ...base, layers: [paint] });
  expect(composeLayerPixels({ ...base, layers: [paint] })).toEqual(worn);
  const more = composeLayerPixels({ ...base, layers: [{ ...paint, amount: 0.75 }] });
  const metals = [];
  for (let i = 0; i < worn.surface.length; i += 4) {
    metals.push(worn.surface[i + 2]);
    expect(more.surface[i + 2]).toBeGreaterThanOrEqual(worn.surface[i + 2]);
    expect(worn.surface[i]).toBe(worn.surface[i + 2]);
    if (worn.surface[i + 2] === 0) {
      expect(worn.color[i]).toBe(255);
      expect(worn.surface[i + 1]).toBe(166);
    }
    if (worn.surface[i + 2] === 255) {
      expect(worn.color[i]).toBe(124);
      expect(worn.surface[i + 1]).toBe(26);
    }
  }
  expect(metals.filter((n) => n === 0).length).toBeGreaterThan(100);
  expect(metals.filter((n) => n === 255).length).toBeGreaterThan(100);
  for (const patch of [{ seed: 5 }, { chipSize: 60 }, { rotation: 45 }])
    expect(composeLayerPixels({ ...base, layers: [{ ...paint, ...patch }] }).color).not.toEqual(
      worn.color,
    );
});

it('local paint does not alter the substrate outside the mark and respects layer order', () => {
  const base = input(),
    paint = {
      ...newSurfaceLayer('paint'),
      amount: 0,
      center: [100, 100] as [number, number],
      width: 40,
      height: 40,
    };
  const clean = composeLayerPixels(base);
  const coated = composeLayerPixels({ ...base, layers: [paint] });
  for (const key of ['color', 'normal', 'surface'] as const)
    expect(coated[key].slice(0, 4)).toEqual(clean[key].slice(0, 4));
  const dust = { ...newSurfaceLayer('dust'), amount: 1 };
  const full = { ...paint, center: undefined };
  const top = composeLayerPixels({ ...base, layers: [dust, full] });
  expect(top.color).toEqual(composeLayerPixels({ ...base, layers: [full] }).color);
  expect(top.color).not.toEqual(composeLayerPixels({ ...base, layers: [full, dust] }).color);
});
