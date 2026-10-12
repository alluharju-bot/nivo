import { expect, it } from 'vitest';
import { traceResolutions, previewPixelBudget } from './traceResolution';

it('starts coarse, increases resolution without overshooting, and reaches native size on a normal view', () => {
  const sizes = traceResolutions(1440, 900);
  expect(sizes[0]).toMatchObject({ width: 640, height: 400 });
  expect(sizes.at(-1)).toMatchObject({ width: 1440, height: 900 });
  expect(sizes.every((s, i) => !i || s.width > sizes[i - 1].width)).toBe(true);
  expect(traceResolutions(320, 240)).toEqual([{ scale: 1, width: 320, height: 240 }]);
});

it('bounds wide, tall, Retina and 8K preview allocations independently of browser DPR', () => {
  for (const [w, h] of [
    [7680, 4320],
    [4320, 7680],
    [5120, 2880],
    [9000, 1000],
    [1000, 9000],
  ]) {
    for (const size of traceResolutions(w, h)) {
      expect(size.width * size.height).toBeLessThanOrEqual(previewPixelBudget);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2560);
      expect(Math.abs(size.width / size.height / (w / h) - 1)).toBeLessThan(0.015);
    }
  }
});
