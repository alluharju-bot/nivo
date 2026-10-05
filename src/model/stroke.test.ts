import { expect, it } from 'vitest';
import { simplifyStroke, type StrokePoint } from './stroke';
it('freehand simplification preserves endpoints and sharp corners instead of uniformly skipping them', () => {
  const points: StrokePoint[] = [
    ...Array.from({ length: 100 }, (_, i): StrokePoint => [i, 0]),
    [100, 0],
    [100, 30],
    [105, 30],
    [105, 0],
    ...Array.from({ length: 100 }, (_, i): StrokePoint => [106 + i, 0]),
  ];
  expect(simplifyStroke(points)).toEqual([
    [0, 0],
    [100, 0],
    [100, 30],
    [105, 30],
    [105, 0],
    [205, 0],
  ]);
});
it('closed silhouettes retain their boundary and their shared first/last point', () => {
  expect(
    simplifyStroke([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]),
  ).toEqual([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]);
});
