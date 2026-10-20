import { expect, it } from 'vitest';
import type { Vec3 } from './project';
import { pointProximity } from './pointProximity';

it('matches the exact center distance test across cell boundaries and large negative coordinates', () => {
  const tolerance = 1e-7;
  const points: Vec3[] = [
    [0, 0, 0],
    [-0.999e-7, 1e-7, 1e-7],
    [-11000, 30000, 16800],
  ];
  const near = pointProximity(points, tolerance);
  const queries: Vec3[] = [
    [1e-7, 0, 0],
    [0.999e-7, 0, 0],
    [1e-8, 1e-7, 1e-7],
  ];
  for (const p of points)
    for (let x = -2; x <= 2; x++)
      for (let y = -2; y <= 2; y++)
        for (let z = -2; z <= 2; z++)
          queries.push([
            p[0] + x * tolerance * 0.6,
            p[1] + y * tolerance * 0.6,
            p[2] + z * tolerance * 0.6,
          ]);
  for (const q of queries)
    expect(near(q)).toBe(
      points.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tolerance),
    );
  expect(pointProximity([], tolerance)([0, 0, 0])).toBe(false);
});
