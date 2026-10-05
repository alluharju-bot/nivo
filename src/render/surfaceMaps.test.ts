import { expect, it } from 'vitest';
import * as THREE from 'three';
import { withColorTexture } from '../storage/textures';
import { normalPixels, roughnessPixels, sourceSize } from './surfaceMaps';
import { updateMaterialPlacement } from './materials';
import {
  appearanceSchema,
  defaultAppearance,
  findPreset,
  surfaceDepth,
  surfaceStrength,
  textureDefaults,
} from '../model/materials';

const ramp = (width: number, height: number) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 10 * (x + y);
      pixels[i + 3] = 255;
    }
  return pixels;
};
it('preserves rectangular source aspect and limits the longest side', () => {
  expect(sourceSize({ width: 2048, height: 256 } as HTMLCanvasElement)).toEqual({
    width: 1024,
    height: 128,
  });
  expect(
    sourceSize({ naturalWidth: 80, naturalHeight: 240, width: 1, height: 1 } as HTMLImageElement),
  ).toEqual({ width: 80, height: 240 });
});
it('derives OpenGL slopes from the physical width and height instead of distorting non-square maps', () => {
  const input = ramp(8, 4),
    index = (2 * 8 + 3) * 4;
  const normal = normalPixels(input, 8, 4, { width: 8, height: 4, depth: 10 });
  expect(normal[index]).toBeLessThan(128);
  expect(normal[index + 1]).toBeGreaterThan(128);
  expect(normal[index] + normal[index + 1]).toBeCloseTo(255, 0);
  const wider = normalPixels(input, 8, 4, { width: 16, height: 4, depth: 10 });
  expect(wider[index]).toBeGreaterThan(normal[index]);
  const flat = normalPixels(input, 8, 4, { width: 8, height: 4, depth: 0 });
  expect([...flat.slice(index, index + 4)]).toEqual([128, 128, 255, 255]);
});
it('wraps the map edges and keeps uniform and single-pixel maps flat', () => {
  const pixels = new Uint8ClampedArray(4 * 12).fill(180);
  const map = normalPixels(pixels, 3, 4);
  for (let i = 0; i < map.length; i += 4)
    expect([...map.slice(i, i + 4)]).toEqual([128, 128, 255, 255]);
  expect([...normalPixels(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1)]).toEqual([
    128, 128, 255, 255,
  ]);
});
it('derives neutral roughness without overwriting the base material roughness or source pixels', () => {
  const input = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  expect([...roughnessPixels(input)]).toEqual([253, 253, 253, 255, 210, 210, 210, 255]);
  expect(input[0]).toBe(0);
  expect(surfaceDepth(findPreset('melamine-oak'))).toBeLessThan(surfaceDepth(findPreset('oak')));
});
it('keeps the physical bump height while scaling every texture channel live', () => {
  const material = new THREE.MeshPhysicalMaterial({
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    roughnessMap: new THREE.Texture(),
  });
  material.userData.physicalSurface = { width: 100, height: 200, strength: 1.5 };
  updateMaterialPlacement(material, { ...textureDefaults, width: 200, height: 100, rotation: 45 });
  expect(material.normalScale.toArray()).toEqual([0.75, 3]);
  expect(material.map!.matrix.elements).toEqual(material.normalMap!.matrix.elements);
  expect(material.map!.matrix.elements).toEqual(material.roughnessMap!.matrix.elements);
});
it('validates optical settings and retains them in appearance data', () => {
  const input = {
    ...defaultAppearance('oak'),
    generatedSurface: true,
    bumpDepth: 0.2,
    normalFormat: 'directx',
  };
  expect(appearanceSchema.parse(input)).toEqual(input);
  expect(appearanceSchema.safeParse({ ...input, bumpDepth: -1 }).success).toBe(false);
  expect(appearanceSchema.safeParse({ ...input, normalFormat: 'guess' }).success).toBe(false);
});

it('imports color images at native aspect while retaining deliberate placement and unlocked scale', () => {
  const appearance = defaultAppearance('oak');
  appearance.texture.offsetX = 42;
  appearance.texture.rotation = 30;
  const asset = { width: 256, height: 64, name: 'grain', dataUrl: 'data:image/png;base64,AAAA' };
  const result = withColorTexture(appearance, 'grain', asset);
  expect(result.texture).toEqual({ ...appearance.texture, height: 75 });
  appearance.texture.lockAspect = false;
  expect(withColorTexture(appearance, 'grain', asset).texture.height).toBe(600);
});

it('keeps legacy imported-map strengths until the user switches to physical depth', () => {
  const appearance = { ...defaultAppearance('melamine-warm-white'), maps: { bump: 'height' } };
  const expected = 0.2;
  expect(surfaceStrength(appearance)).toBe(expected);
  expect(surfaceStrength({ ...appearance, bumpDepth: 0.1 })).toBe(1);
  expect(surfaceStrength({ ...appearance, maps: { normal: 'normal' } })).toBe(expected);
});
