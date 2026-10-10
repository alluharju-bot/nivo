import { expect, it } from 'vitest';
import { rememberMeasures, nearestRememberedMeasure, memoryMaySnap } from './measureMemory';

it('remembers five distinct dimensions, refreshes recency and ignores incomplete input', () => {
  expect(rememberMeasures([92, 38, 13, 98, 600], [15, -92, 0, NaN, Infinity, 200000])).toEqual([
    92, 15, 38, 13, 98,
  ]);
  expect(rememberMeasures([48, 92], [48 + 1e-9])).toEqual([48, 92]);
});
it('uses a small screen radius, resolves ties by recency and releases outside the radius', () => {
  expect(nearestRememberedMeasure(94, [96, 92], (n) => Math.abs(n - 94))).toBe(96);
  expect(nearestRememberedMeasure(94, [92], (n) => Math.abs(n - 94) * 3)).toBeUndefined();
  expect(nearestRememberedMeasure(1, [92], () => 1)).toBeUndefined();
  expect(nearestRememberedMeasure(0, [92], () => 1)).toBeUndefined();
});
it('never overrides physical intersections, endpoints, references or pen closure', () => {
  for (const key of ['vertex:0', 'origin', 'reference', 'pen:0', 'guide:intersection', 'edge'])
    expect(memoryMaySnap(key)).toBe(false);
  for (const key of ['free', 'grid', 'axis-hint']) expect(memoryMaySnap(key)).toBe(true);
});
