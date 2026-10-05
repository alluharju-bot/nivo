import { describe, expect, it } from 'vitest';
import { moveGuideEndpoint } from './guideEditing';
import { guidePoints } from './guides';
import { makeBody, type Guide } from './project';

const a: Guide = {
  id: 'a',
  mode: 'free',
  anchor: { point: [0, 0, 13] },
  endAnchor: { point: [100, 0, 13] },
  length: 100,
  angle: 0,
  plane: 'XY',
};
const b: Guide = { ...a, id: 'b', anchor: a.endAnchor!, endAnchor: { point: [100, 100, 13] } };

describe('independent measurement endpoints', () => {
  it.each([0, 1] as const)(
    'moves endpoint %s without changing the other segment at a shared corner',
    (end) => {
      const guides = [a, b];
      const result = moveGuideEndpoint(
        [],
        guides,
        { guideId: end ? 'a' : 'b', end },
        { point: [148, 38, 13] },
      );
      const changed = end ? 0 : 1,
        other = 1 - changed;
      expect(result[other]).toBe(guides[other]);
      expect(guidePoints([], result[changed])![end]).toEqual([148, 38, 13]);
      expect(guidePoints([], result[changed])![end ? 0 : 1]).toEqual(
        guidePoints([], guides[changed])![end ? 0 : 1],
      );
      expect(guidePoints([], b)).toEqual([
        [100, 0, 13],
        [100, 100, 13],
      ]);
    },
  );
  it('preserves a moved endpoint reference and an offset fixed endpoint', () => {
    const body = makeBody(48, 98, 13);
    const line: Guide = { ...a, offset: [0, 38, 0] };
    const anchor = {
      bodyId: body.id,
      key: 'corner:0',
      local: [0, 0, 0] as [number, number, number],
    };
    const result = moveGuideEndpoint([body], [line], { guideId: 'a', end: 1 }, anchor)[0];
    expect(result.endAnchor).toEqual(anchor);
    expect(guidePoints([body], result)).toEqual([
      [0, 38, 13],
      [0, 0, 0],
    ]);
    expect(guidePoints([{ ...body, origin: [0, 0, 10] }], result)![1]).toEqual([0, 0, 10]);
  });
  it('rejects collapsed and missing segments without mutating the project', () => {
    expect(() => moveGuideEndpoint([], [a, b], { guideId: 'a', end: 1 }, a.anchor)).toThrow(
      '0,1 mm',
    );
    expect(() => moveGuideEndpoint([], [a, b], { guideId: 'missing', end: 0 }, a.anchor)).toThrow(
      'ei enää',
    );
    expect(guidePoints([], a)).toEqual([
      [0, 0, 13],
      [100, 0, 13],
    ]);
  });
});
