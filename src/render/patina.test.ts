import { expect, it } from 'vitest';
import { patinaPixels } from './patina';

it('uses one seamless mask for rough green oxide and more reflective exposed copper', () => {
  const maps = patinaPixels();
  let oxide = 0,
    copper = 0,
    seam = 0,
    largest = 0;
  for (let i = 0; i < maps.color.length; i += 4) {
    if (maps.metalness[i] < 25) {
      oxide++;
      expect(maps.color[i + 1]).toBeGreaterThan(maps.color[i]);
      expect(maps.roughness[i]).toBeGreaterThan(200);
    } else if (maps.metalness[i] > 230) {
      copper++;
      expect(maps.color[i]).toBeGreaterThan(maps.color[i + 1]);
      expect(maps.roughness[i]).toBeLessThan(110);
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
  expect(seam / 256).toBeLessThan(largest);
  expect(patinaPixels()).toEqual(maps);
});
