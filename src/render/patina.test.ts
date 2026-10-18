import { expect, it } from 'vitest';
import { patinaPixels } from './patina';

it('uses one seamless mask for rough green oxide and more reflective exposed copper', () => {
  const maps = patinaPixels();
  let oxide = 0,
    copper = 0,
    seam = 0,
    largest = 0,
    oxideContrast = Infinity,
    oxideRoughness = Infinity,
    copperContrast = Infinity,
    copperRoughness = -Infinity;
  // Check every pixel, but aggregate the bounds instead of creating thousands of matchers.
  for (let i = 0; i < maps.color.length; i += 4) {
    if (maps.metalness[i] < 25) {
      oxide++;
      oxideContrast = Math.min(oxideContrast, maps.color[i + 1] - maps.color[i]);
      oxideRoughness = Math.min(oxideRoughness, maps.roughness[i]);
    } else if (maps.metalness[i] > 230) {
      copper++;
      copperContrast = Math.min(copperContrast, maps.color[i] - maps.color[i + 1]);
      copperRoughness = Math.max(copperRoughness, maps.roughness[i]);
    }
  }
  for (let y = 0; y < 256; y++) {
    const start = y * 256 * 4;
    seam += Math.abs(maps.height[start] - maps.height[start + 255 * 4]);
    for (let x = 1; x < 256; x++)
      largest = Math.max(
        largest,
        Math.abs(maps.height[start + x * 4] - maps.height[start + (x - 1) * 4]),
      );
  }
  expect(oxide).toBeGreaterThan(1000);
  expect(copper).toBeGreaterThan(1000);
  expect(oxideContrast).toBeGreaterThan(0);
  expect(oxideRoughness).toBeGreaterThan(200);
  expect(copperContrast).toBeGreaterThan(0);
  expect(copperRoughness).toBeLessThan(110);
  expect(seam / 256).toBeLessThan(largest);
  const repeated = patinaPixels();
  for (const key of ['color', 'height', 'roughness', 'metalness'] as const)
    expect(Buffer.from(repeated[key]).equals(Buffer.from(maps[key])), key).toBe(true);
});

it('keeps iron rust localized and aligns its colour, roughness and nonmetallic coating', () => {
  const maps = patinaPixels(256, 1, 'iron-rust');
  let rust = 0,
    exposed = 0;
  let rustRoughness = Infinity,
    metalRoughness = 0,
    rustWarmth = Infinity;
  for (let i = 0; i < maps.color.length; i += 4) {
    if (maps.metalness[i] < 25) {
      rust++;
      rustRoughness = Math.min(rustRoughness, maps.roughness[i]);
      rustWarmth = Math.min(rustWarmth, maps.color[i] - maps.color[i + 1]);
    } else if (maps.metalness[i] > 230) {
      exposed++;
      metalRoughness = Math.max(metalRoughness, maps.roughness[i]);
    }
  }
  const count = maps.color.length / 4;
  expect(rust / count).toBeGreaterThan(0.02);
  expect(rust / count).toBeLessThan(0.25);
  expect(exposed / count).toBeGreaterThan(0.6);
  expect(rustWarmth).toBeGreaterThan(35);
  expect(rustRoughness).toBeGreaterThan(metalRoughness + 70);
});

it('gives polished iron and black iron distinct finishes without copper-green oxidation', () => {
  const polished = patinaPixels(128, 1, 'iron-polished');
  const black = patinaPixels(128, 1, 'iron-black');
  let polishedRoughness = 0,
    blackRoughness = 0,
    green = 0,
    lightestBlack = 0;
  for (let i = 0; i < polished.color.length; i += 4) {
    polishedRoughness += polished.roughness[i];
    blackRoughness += black.roughness[i];
    green = Math.max(green, polished.color[i + 1] - polished.color[i]);
    lightestBlack = Math.max(lightestBlack, ...black.color.slice(i, i + 3));
  }
  expect(polishedRoughness / blackRoughness).toBeLessThan(0.65);
  expect(green).toBeLessThan(6);
  expect(lightestBlack).toBeLessThan(55);
  expect(lightestBlack).toBeGreaterThan(25);
  for (const finish of ['iron-rust', 'iron-polished', 'iron-black'] as const) {
    const a = patinaPixels(64, 1, finish),
      b = patinaPixels(64, 1, finish);
    for (const key of ['color', 'height', 'roughness', 'metalness'] as const)
      expect(Buffer.from(a[key]).equals(Buffer.from(b[key])), `${finish}:${key}`).toBe(true);
  }
});
