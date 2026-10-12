import { expect, it } from 'vitest';
import { coarseImageWeight, refinementSamples } from './traceRefinement';

it('starts from the coarse estimate and retires it entirely without a permanent bias', () => {
  expect(coarseImageWeight(0)).toBe(1);
  expect(coarseImageWeight(1)).toBeGreaterThan(0.9);
  expect(coarseImageWeight(refinementSamples / 2)).toBe(0.5);
  for (let i = 1; i <= refinementSamples; i++) {
    expect(coarseImageWeight(i)).toBeLessThan(coarseImageWeight(i - 1));
  }
  expect(coarseImageWeight(refinementSamples)).toBe(0);
  expect(coarseImageWeight(4096)).toBe(0);
});
