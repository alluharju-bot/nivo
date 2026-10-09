import { expect, it } from 'vitest';
import type { Vec3 } from './project';
import type { CadEdge } from '../cad/protocol';
import { onCurve } from './curveSnap';
import { guideEdgeIntersection, guideEdgeProjection } from './snap';

const arc: CadEdge = {
  start: [10, 0, -10],
  end: [0, 10, -10],
  from: { bodyId: 'c', key: 'a', local: [10, 0, 0] },
  to: { bodyId: 'c', key: 'b', local: [0, 10, 0] },
  circle: { center: [0, 0, -10], normal: [0, 0, 1], radius: 10 },
};
it('circle snaps and crossings use the exact radius, not an inscribed chord', () => {
  const p = onCurve([5, 5, -10], arc);
  expect(p[0]).toBeCloseTo(Math.SQRT1_2 * 10, 10);
  const line = {
    id: 'line',
    points: [
      [0, 0, -10],
      [20, 20, -10],
    ] as [Vec3, Vec3],
    mode: 'free' as const,
  };
  guideEdgeIntersection(line, arc)!.forEach((n, i) => expect(n).toBeCloseTo(p[i], 9));
  expect(
    guideEdgeIntersection(
      {
        ...line,
        points: [
          [0, 0, 0],
          [20, 20, 0],
        ],
      },
      arc,
    ),
  ).toBeUndefined();
  const reference = guideEdgeProjection(
    {
      ...line,
      points: [
        [0, 0, 0],
        [20, 20, 0],
      ],
    },
    arc,
    [0, 0, 1],
  )!;
  reference.forEach((n, i) => expect(n).toBeCloseTo(p[i], 9));
  expect(
    guideEdgeIntersection(
      {
        ...line,
        points: [
          [0, 0, -10],
          [2, 2, -10],
        ],
      },
      arc,
    ),
  ).toBeUndefined();
});
