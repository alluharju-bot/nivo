import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createShape, meshBody } from '../cad/kernel';
import { booleanBodies } from '../cad/operations';
import { translateMesh } from '../cad/translateMesh';
import { makeBody, type Body } from '../model/project';
import { surfaceIntersections } from './surfaceIntersections';
import { guideEdgeIntersection } from '../model/snap';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const mesh = (body: Body) => {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
};

it('finds the raised floor/wall seam exactly, caches it, and recomputes it after movement', () => {
  const floor = mesh(makeBody(3000, 2000, 100, [0, 0, -20]));
  const wall = mesh(makeBody(2000, 100, 2400, [250, 1600, 0]));
  const seams = surfaceIntersections(floor, wall);
  const front = seams.find(
    (s) => s.start[1] === 1600 && s.end[1] === 1600 && s.start[2] === 80 && s.end[2] === 80,
  )!;
  expect(front).toBeTruthy();
  expect([front.start[0], front.end[0]].sort((a, b) => a - b)).toEqual([250, 2250]);
  expect(surfaceIntersections(floor, wall)).toBe(seams);
  const raised = translateMesh(floor, floor.id, [0, 0, 18.625]);
  const changed = surfaceIntersections(raised, wall);
  expect(changed.some((s) => s.start[2] === 98.625 && s.end[2] === 98.625)).toBe(true);
  expect(changed.some((s) => s.start[2] === 80 && s.end[2] === 80)).toBe(false);
  expect(
    guideEdgeIntersection(
      {
        id: 'g',
        mode: 'guide',
        points: [
          [1300, 1600, 400],
          [1300, 1600, 1800],
        ],
      },
      front,
    ),
  ).toEqual([1300, 1600, 80]);
});

it('trims the seam around a real opening instead of snapping across empty space', () => {
  const floor = mesh(makeBody(3000, 2000, 100, [0, 0, -20]));
  const wall = makeBody(2000, 100, 2400, [250, 1600, 0]);
  const cut = booleanBodies([wall], [makeBody(800, 300, 2100, [850, 1500, -20])], 'cut')[0];
  const seams = surfaceIntersections(floor, mesh(cut)).filter(
    (s) =>
      Math.abs(s.start[1] - 1600) < 1e-5 &&
      Math.abs(s.end[1] - 1600) < 1e-5 &&
      Math.abs(s.start[2] - 80) < 1e-5 &&
      Math.abs(s.end[2] - 80) < 1e-5,
  );
  const ranges = seams
    .map((s) => [s.start[0], s.end[0]].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
  expect(ranges).toEqual([
    [250, 850],
    [1650, 2250],
  ]);
});

it('rejects separated surfaces and coplanar pairs without inventing infinite lines', () => {
  const a = mesh(makeBody(100, 100, 10));
  const b = mesh(makeBody(100, 100, 10, [200, 0, 0]));
  expect(surfaceIntersections(a, b)).toEqual([]);
  const flatA = { ...a, faces: a.faces.filter((f) => f.ref === 'z:max') };
  const flatB = { ...a, id: 'b', faces: a.faces.filter((f) => f.ref === 'z:max') };
  expect(surfaceIntersections(flatA, flatB)).toEqual([]);
});
