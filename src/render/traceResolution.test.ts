import { expect, it } from 'vitest';
import { traceResolutions, previewPixelBudget, tracePreviewLimits } from './traceResolution';

it('starts coarse, increases resolution without overshooting, and reaches native size on a normal view', () => {
  const sizes = traceResolutions(1440, 900);
  expect(sizes[0]).toMatchObject({ width: 360, height: 225 });
  expect(sizes.at(-1)).toMatchObject({ width: 1440, height: 900 });
  expect(sizes.every((s, i) => !i || s.width > sizes[i - 1].width)).toBe(true);
  expect(sizes.map((s) => s.width)).toEqual([360, 720, 1440]);
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
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(8192);
      // A very wide coarse preview can be only ~60 px high: permit one
      // rounded pixel per dimension, not a fixed percentage of that height.
      expect(Math.abs(size.width / size.height / (w / h) - 1)).toBeLessThan(
        1 / size.width + 1 / size.height,
      );
    }
    const sizes = traceResolutions(w, h);
    for (let i = 1; i < sizes.length; i++) {
      // A parent cannot become a second full-size allocation at the last step.
      expect(sizes[i - 1].width * sizes[i - 1].height).toBeLessThanOrEqual(
        (sizes[i].width * sizes[i].height) / 4,
      );
    }
  }
});

it('retains native 4K and Retina detail and reduces allocations on tablets and low-memory GPUs', () => {
  for (const [width, height] of [
    [3840, 2160],
    [2880, 1800],
    [3440, 1440],
  ])
    expect(traceResolutions(width, height).at(-1)).toEqual({ width, height, scale: 1 });
  const tablet = tracePreviewLimits({ coarsePointer: true, deviceMemory: 8 });
  const small = tracePreviewLimits({ deviceMemory: 2 });
  const fallback = tracePreviewLimits({ floatBlend: false });
  expect(tablet.pixelBudget).toBeLessThanOrEqual(3_200_000);
  expect(small.pixelBudget).toBeLessThan(tablet.pixelBudget);
  expect(fallback.pixelBudget).toBeLessThan(previewPixelBudget);
  for (const limits of [tablet, small, fallback, tracePreviewLimits({ maxTextureSize: 2048 })]) {
    const final = traceResolutions(3840, 2160, limits).at(-1)!;
    expect(final.width * final.height).toBeLessThanOrEqual(limits.pixelBudget);
    expect(Math.max(final.width, final.height)).toBeLessThanOrEqual(limits.maxSide);
  }
});
