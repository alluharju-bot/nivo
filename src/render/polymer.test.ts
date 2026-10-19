import { expect, it } from 'vitest';
import { polymerMaterials } from '../model/polymerMaterials';
import { defaultAppearance, findPreset, hasAppearanceTexture } from '../model/materials';
import { freshProject, makeBody, parseProject } from '../model/project';
import { newSurfaceLayer } from '../model/surfaceLayers';
import { polymerPixels, polymerSample } from './polymer';
import { normalPixels } from './surfaceMaps';
import { composeLayerPixels, type LayerInput } from './layerPixels';

it('keeps polymer grain seamless, deterministic and distinct from directional grip ribs', () => {
  for (const kind of ['fine', 'pebbled', 'ribbed'] as const) {
    for (const [u, v] of [
      [0, 0.3],
      [-0.41, 0.24],
      [0.99999, -0.32],
    ]) {
      const a = polymerSample(kind, u, v, 101),
        b = polymerSample(kind, u + 1, v - 1, 101);
      expect(a.height).toBeCloseTo(b.height, 10);
      expect(a.grain).toBeCloseTo(b.grain, 10);
    }
    const a = polymerPixels(kind, 101, 64),
      b = polymerPixels(kind, 101, 64);
    expect(a).toEqual(b);
    expect(a.height).not.toEqual(polymerPixels(kind, 102, 64).height);
    expect(new Set(a.height).size).toBeGreaterThan(60);
    expect(Math.min(...a.roughness)).toBeGreaterThanOrEqual(230);
    expect(Math.min(...a.color)).toBeGreaterThanOrEqual(248);
  }
  expect(polymerSample('ribbed', 0, 0.1, 1).height).toBeGreaterThan(0.89);
  expect(polymerSample('ribbed', 1 / 12, 0.1, 1).height).toBeLessThan(0.11);
});

it('ships nonmetallic, tintable presets with physical relief and portable placement', () => {
  const bodies = polymerMaterials.map((p) => {
    expect(findPreset(p.id)).toBe(p);
    expect(p.metalness).toBe(0);
    expect(p.transmission ?? 0).toBe(0);
    const appearance = defaultAppearance(p.id);
    expect(hasAppearanceTexture(appearance)).toBe(true);
    expect([appearance.texture.width, appearance.texture.height]).toEqual(p.size);
    const height = polymerPixels(p.polymer!, p.seed!, 128).height;
    const normals = normalPixels(height, 128, 128, {
      width: p.size![0],
      height: p.size![1],
      depth: p.relief!,
    });
    expect(new Set(normals.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(8);
    return { ...makeBody(), color: p.color, appearance };
  });
  expect(parseProject(JSON.stringify({ ...freshProject(), bodies })).bodies).toEqual(bodies);
});

// Each preset has its own execution budget on shared CI runners; keep the
// full overlay matrix and original-map checks for every material.
it.each(polymerMaterials)(
  'composes every overlay over $id without changing the original maps or making it metallic',
  (preset) => {
    const maps = polymerPixels(preset.polymer!, preset.seed!, 128);
    const normals = normalPixels(maps.height, 128, 128, {
      width: preset.size![0],
      height: preset.size![1],
      depth: preset.relief!,
    });
    const texture = (pixels: Uint8ClampedArray, srgb = false) => ({
      pixels,
      width: 128,
      height: 128,
      flipY: true,
      srgb,
      wrapS: 1000,
      wrapT: 1000,
      matrix: [1 / preset.size![0], 0, 0, 0, 1 / preset.size![1], 0, 0, 0, 1],
    });
    const mask = { ...texture(new Uint8ClampedArray([255, 255, 255, 255])), width: 1, height: 1 };
    const input: LayerInput = {
      domain: { x: 0, y: 0, width: 48, height: 48 },
      width: 32,
      height: 32,
      layers: [],
      color: [0.06, 0.08, 0.09],
      roughness: preset.roughness,
      metalness: 0,
      clearcoat: 0,
      transmission: 0,
      normalScale: [1, 1],
      maps: {
        color: texture(maps.color, true),
        normal: texture(normals),
        roughness: texture(maps.roughness),
      },
      masks: { scratches: { mask }, fingerprints: { mask } },
    };
    const clean = composeLayerPixels(input);
    for (const kind of ['dust', 'scratches', 'fingerprints', 'water', 'paint'] as const) {
      const layer = { ...newSurfaceLayer(kind), amount: 0.5, width: 48, height: 48 };
      const result = composeLayerPixels({ ...input, layers: [layer] });
      expect(result.color, `${preset.id} ${kind}`).not.toEqual(clean.color);
      expect(new Set(result.surface.filter((_, i) => i % 4 === 2))).toEqual(new Set([0]));
      expect(composeLayerPixels({ ...input, layers: [{ ...layer, enabled: false }] })).toEqual(
        clean,
      );
    }
    expect(maps).toEqual(polymerPixels(preset.polymer!, preset.seed!, 128));
  },
);
