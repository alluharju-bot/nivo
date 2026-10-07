import { describe, it, expect } from 'vitest';
import { penAxisHint, penPointAtLength, penTravelDirection } from './penInput';
import type { Vec3 } from './project';

describe('pen lengths relative to drawing direction', () => {
  it('softly prefers axes within five degrees in either direction without leaving the drawing plane', () => {
    for (const sign of [-1, 1]) {
      for (const degrees of [1, 4.9, 5]) {
        const raw: Vec3 = [13 + sign * 1000, 48 + 1000 * Math.tan((degrees * Math.PI) / 180), 66];
        expect(penAxisHint([13, 48, 66], raw, [0, 0, 1])).toEqual({
          axis: 'x',
          point: [13 + sign * 1000, 48, 66],
        });
      }
      expect(penAxisHint([0, 0, 0], [sign * 1000, 110, 0], [0, 0, 1])).toBeUndefined();
    }
    expect(penAxisHint([0, 0, 0], [20, 0, -1000], [0, 1, 0])).toEqual({
      axis: 'z',
      point: [0, 0, -1000],
    });
    expect(penAxisHint([0, 0, 0], [1000, 0, 20], [0.02, 0, 0.9998])).toBeUndefined();
  });
  for (const axis of [0, 1, 2]) {
    for (const sign of [-1, 1]) {
      it(`preserves travel along axis ${axis}, sign ${sign}`, () => {
        const start: Vec3 = [48, 98, 13];
        const pointer = [...start] as Vec3;
        pointer[axis] += sign * 100;
        const constraint: Vec3 = [0, 0, 0];
        constraint[axis] = 1;
        const direction = penTravelDirection(start, pointer, constraint)!;
        for (const distance of [15, -15, 0]) {
          const expected = [...start] as Vec3;
          expected[axis] += sign * distance;
          expect(penPointAtLength(start, direction, distance)).toEqual(expected);
        }
      });
    }
  }
  it('keeps diagonal and near-zero headings without choosing a world axis', () => {
    const start: Vec3 = [48, 98, 13];
    const heading = penTravelDirection(start, [18, 58, 13]);
    expect(penPointAtLength(start, heading, 15)).toEqual([39, 86, 13]);
    expect(penPointAtLength(start, heading, -15)).toEqual([57, 110, 13]);
    expect(penTravelDirection(start, start, undefined, heading)).toEqual(heading);
    expect(penTravelDirection(start, start)).toBeUndefined();
    expect(() => penPointAtLength(start, undefined, 15)).toThrow('suunta');
  });
});
