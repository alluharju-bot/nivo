import { expect, it } from 'vitest';
import { rotationAngle } from './rotationSnap';
it('snaps signed and multi-turn drags to 5 degrees with stronger quarter turns, Shift bypasses both', () => {
  expect([12, 18, -18, 364, 86, 94, -94, 176].map((n) => rotationAngle(n))).toEqual([
    10, 20, -20, 360, 90, 90, -90, 180,
  ]);
  expect(rotationAngle(12.345, true)).toBe(12.35);
  expect(rotationAngle(88.25, true)).toBe(88.25);
});
