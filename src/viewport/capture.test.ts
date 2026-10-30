import { expect, it } from 'vitest';
import { modelCaptureScale } from './capture';

it('renders ordinary model captures at twice the drawing-buffer resolution', () => {
  expect(modelCaptureScale(1200, 800)).toBe(2);
  expect(modelCaptureScale(400, 700)).toBe(2);
});

it('bounds extra GPU allocation on large and high-DPI viewports', () => {
  for (const [width, height, limit] of [
    [2560, 1440, 4096],
    [1440, 2560, 4096],
    [3500, 900, 4096],
    [1800, 1800, 4096],
    [1500, 900, 2048],
  ]) {
    const scale = modelCaptureScale(width, height, limit);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(2);
    expect(Math.max(width, height) * scale).toBeLessThanOrEqual(limit);
    expect(Math.floor(width * scale) * Math.floor(height * scale)).toBeLessThanOrEqual(8_000_000);
    expect((width * scale) / (height * scale)).toBeCloseTo(width / height);
  }
});

it('preserves existing high-resolution buffers and handles an unready viewport', () => {
  expect(modelCaptureScale(5120, 2880)).toBe(1);
  expect(modelCaptureScale(3000, 3000)).toBe(1);
  expect(modelCaptureScale(0, 0)).toBe(1);
});
