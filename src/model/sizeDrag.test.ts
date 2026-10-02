import { expect, it } from 'vitest';
import { dragSize, type SizeDrag } from './sizeDrag';

it('separates clicking from dragging, locks the initial direction and supports reversing below the initial size', () => {
  const drag: SizeDrag = { x: 100, y: 200, initial: 10, millimetersPerPixel: 0.5 };
  expect(dragSize(drag, 102, 202)).toBeUndefined();
  expect(dragSize(drag, 106, 208)).toBe(15);
  expect(dragSize(drag, 112, 216)).toBe(20);
  expect(dragSize(drag, 108, 194)).toBe(10); // perpendicular movement
  expect(dragSize(drag, 94, 192)).toBe(5);
  expect(dragSize(drag, 40, 120)).toBe(0.1);
});

it('works in every screen direction and keeps the same physical scale at different zoom levels', () => {
  for (const [x, y] of [
    [20, 0],
    [-20, 0],
    [0, 20],
    [0, -20],
  ]) {
    const start = { x: 0, y: 0, initial: 2 };
    expect(dragSize({ ...start, millimetersPerPixel: 0.5 }, x, y)).toBe(12);
    expect(dragSize({ ...start, millimetersPerPixel: 0.25 }, 2 * x, 2 * y)).toBe(12);
  }
  expect(dragSize({ x: 0, y: 0, initial: 2, millimetersPerPixel: 100 }, 2000, 0)).toBe(100_000);
});
