import { expect, it } from 'vitest';
import type { BodyMesh, CadEdge } from '../cad/protocol';
import type { Vec3 } from './project';
import { moveDirections, moveGridPoint, worldAxis } from './moveDirections';
import { dot, scale } from './geometry';
import { rotateVector } from './transforms';

const mesh = (vectors: Vec3[]): BodyMesh =>
  ({
    edgesCAD: vectors.map((end) => ({ start: [0, 0, 0], end }) as CadEdge),
    faces: [],
  }) as unknown as BodyMesh;

it('follows a sloped stair in all three directions, independently of CAD edge orientation', () => {
  const rotated = (p: Vec3) => rotateVector(p, [0, 1, 0], -30);
  for (const sign of [-1, 1]) {
    const directions = moveDirections(
      mesh(
        [
          [200, 0, 0],
          [0, 40, 0],
          [0, 0, 20],
        ].map((p) => scale(rotated(p as Vec3), sign)),
      ),
    );
    expect(dot(directions[0], rotated([1, 0, 0]))).toBeCloseTo(1, 8);
    expect(worldAxis(directions[0])).toBeUndefined();
    expect(worldAxis(directions[1])).toBe('y');
    for (const a of directions) {
      expect(Math.hypot(...a)).toBeCloseTo(1, 8);
      for (const b of directions.filter((d) => d !== a)) expect(dot(a, b)).toBeCloseTo(0, 8);
    }
  }
});
it('retains world axes for ordinary parts and supplies a perpendicular frame for an open line', () => {
  expect(
    moveDirections(
      mesh([
        [100, 0, 0],
        [0, 20, 0],
        [0, 0, 10],
      ]),
    ).map(worldAxis),
  ).toEqual(['x', 'y', 'z']);
  const directions = moveDirections(mesh([[100, 50, 10]]));
  expect(directions).toHaveLength(3);
  expect(dot(directions[0], directions[1])).toBeCloseTo(0, 8);
  expect(directions.flat().every(Number.isFinite)).toBe(true);
});
it('rounds distance on an oblique line while preserving the off-grid anchor and slope', () => {
  const start: Vec3 = [3.125, -7.25, 2.75],
    direction: Vec3 = [0.6, 0, 0.8];
  expect(moveGridPoint(start, [16.325, -7.25, 20.35], 10, direction)).toEqual([
    15.125, -7.25, 18.75,
  ]);
  expect(moveGridPoint(start, [-10.075, -7.25, -14.85], 10, direction)).toEqual([
    -8.875, -7.25, -13.25,
  ]);
});
it('caches dense source geometry and ignores circular arc chords', () => {
  const source = mesh([
    [20, 0, 0],
    [0, 1000, 1000],
  ]);
  source.edgesCAD[1].circle = { center: [0, 0, 0], radius: 1000, normal: [1, 0, 0] };
  const directions = moveDirections(source);
  expect(worldAxis(directions[0])).toBe('x');
  expect(moveDirections(source)).toBe(directions);
});
