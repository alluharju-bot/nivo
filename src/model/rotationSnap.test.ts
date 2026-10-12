import { expect, it } from 'vitest';
import { rotationAngle, rotationDirection, rotationReferenceAngle } from './rotationSnap';
import { rotatePoint } from './transforms';
it('snaps signed and multi-turn drags to 5 degrees with stronger quarter turns, Shift bypasses both', () => {
  expect([12, 18, -18, 364, 86, 94, -94, 176].map((n) => rotationAngle(n))).toEqual([
    10, 20, -20, 360, 90, 90, -90, 180,
  ]);
  expect(rotationAngle(12.345, true)).toBe(12.35);
  expect(rotationAngle(88.25, true)).toBe(88.25);
});
it('aligns a stair point to a reference in the rotation plane, without moving its anchor', () => {
  const pivot: [number, number, number] = [10, 20, 30],
    axis: [number, number, number] = [0, 1, 0],
    source: [number, number, number] = [210, 20, 30],
    target: [number, number, number] = [170, -150, 150];
  const reference = rotationDirection(source, pivot, axis)!;
  const angle = rotationReferenceAngle(reference, rotationDirection(target, pivot, axis)!, axis);
  expect(angle).toBeCloseTo(-36.86989765, 7);
  expect(rotatePoint(pivot, pivot, axis, angle)).toEqual(pivot);
  const result = rotatePoint(source, pivot, axis, angle);
  expect(result[0]).toBeCloseTo(170, 7);
  expect(result[1]).toBe(20); // Off-plane references cannot translate the part.
  expect(result[2]).toBeCloseTo(150, 7);
  expect(rotationDirection([10, 100, 30], pivot, axis)).toBeUndefined();
});
it('supports all principal axes and an oblique picked edge', () => {
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ] as [number, number, number][]) {
    const source: [number, number, number] = [30, 60, 90],
      pivot: [number, number, number] = [0, 0, 0];
    const target = rotatePoint(source, pivot, axis, -127.35);
    expect(
      rotationReferenceAngle(
        rotationDirection(source, pivot, axis)!,
        rotationDirection(target, pivot, axis)!,
        axis,
      ),
    ).toBeCloseTo(-127.35, 7);
  }
});
