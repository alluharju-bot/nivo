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
