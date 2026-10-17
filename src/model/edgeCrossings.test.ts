import { expect, it } from 'vitest';
import type { CadEdge } from '../cad/protocol';
import type { Vec3 } from './project';
import { edgeCrossings } from './edgeCrossings';
import { snapPriority, snapScore, guideSnapCandidates } from './snap';

const edge = (start: Vec3, end: Vec3): CadEdge => ({
  start,
  end,
  from: { bodyId: 'part', key: 'a', local: start },
  to: { bodyId: 'part', key: 'b', local: end },
});

it('finds a drawn segment crossing a sloped triangular face edge, in either direction', () => {
  const diagonal = edge([0, 0, 10], [200, 120, 30]);
  const line = edge([0, 30, 15], [200, 30, 15]);
  for (const [a, b] of [
    [diagonal, line],
    [line, diagonal],
  ]) {
    const points = edgeCrossings(a, b);
    expect(points).toHaveLength(1);
    points[0].forEach((n, i) => expect(n).toBeCloseTo([50, 30, 15][i], 7));
  }
  expect(edgeCrossings(diagonal, edge([0, 30, 14], [200, 30, 14]))).toEqual([]);
  expect(edgeCrossings(diagonal, edge([100, 30, 15], [200, 30, 15]))).toEqual([]);
  expect(edgeCrossings(diagonal, edge(diagonal.end, [300, 50, 30]))).toEqual([]);
  expect(edgeCrossings(diagonal, diagonal)).toEqual([]);
});

it('uses the true circular boundary rather than the rendered chord', () => {
  const arc: CadEdge = {
    ...edge([10, 0, 0], [0, 10, 0]),
    circle: { center: [0, 0, 0], normal: [0, 0, 1], radius: 10 },
  };
  const line = edge([-20, 6, 0], [20, 6, 0]);
  expect(edgeCrossings(arc, line)).toEqual([[8, 6, 0]]);
  expect(edgeCrossings(line, arc)).toEqual([[8, 6, 0]]);
});

it('intersects circular boundaries in the same plane and across tilted planes', () => {
  const a: CadEdge = {
    ...edge([10, 0, 0], [0, 10, 0]),
    circle: { center: [0, 0, 0], normal: [0, 0, 1], radius: 10 },
  };
  const b: CadEdge = {
    ...edge([-2, 0, 0], [8, 10, 0]),
    circle: { center: [8, 0, 0], normal: [0, 0, 1], radius: 10 },
  };
  const points = edgeCrossings(a, b);
  expect(points).toHaveLength(1);
  expect(points[0][0]).toBeCloseTo(4, 7);
  expect(points[0][1]).toBeCloseTo(Math.sqrt(84), 7);
  expect(edgeCrossings(a, a)).toEqual([]);
  const tilted: CadEdge = {
    ...edge([10, 0, 0], [0, 0, 10]),
    circle: { center: [0, 0, 0], normal: [0, 1, 0], radius: 10 },
  };
  expect(edgeCrossings(a, tilted)).toEqual([[10, 0, 0]]);
});

it('ranks corners, midpoints, intersections and edges consistently without overriding precise aim', () => {
  const candidates = [
    { key: 'part:vertex:1', label: 'Verteksi' },
    { key: 'part:mid:1', label: 'Reunan keskipiste' },
    { key: 'part:edge:1:intersection:line:edge:0', label: 'Reunojen risteys' },
    { key: 'part:edge:1', label: 'Reuna' },
  ];
  expect(candidates.map(snapPriority)).toEqual([0, 1, 2, 3]);
  expect(snapScore(0, snapPriority(candidates[2]))).toBeLessThan(
    snapScore(12, snapPriority(candidates[0])),
  );
  const guides = guideSnapCandidates(
    [50, 30, 0],
    [
      {
        id: 'a',
        points: [
          [0, 30, 0],
          [200, 30, 0],
        ],
        mode: 'free',
      },
      {
        id: 'b',
        points: [
          [50, 0, 0],
          [50, 120, 0],
        ],
        mode: 'free',
      },
    ],
    20,
  );
  for (const candidate of guides) expect(candidate.priority).toBe(snapPriority(candidate));
});
