import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { sweepPath, type SweepOptions } from './sweep';
import { penPath } from './paths';
import { bezierPath } from './modeling';
import { makeBody, makeProfileBody, freshProject, parseProject } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, shapeIsValid } from './kernel';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const options: SweepOptions = {
  profile: 'circle',
  width: 20,
  height: 40,
  wall: 0,
  rotation: 0,
  name: 'Putki',
};
it.each([0, 2])(
  'sweeps a round section along a tilted line with wall %s, preserving the source',
  (wall) => {
    const path = {
      ...penPath(
        [
          [10, 20, 30],
          [310, 420, 30],
        ],
        'Reitti',
      ),
      locked: true,
    };
    const before = JSON.stringify(path),
      result = sweepPath(path, { ...options, wall });
    expect(JSON.stringify(path)).toBe(before);
    expect(result.mesh.volume).toBeCloseTo(Math.PI * (100 - (wall ? 64 : 0)) * 500, 2);
    const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }))
      .bodies[0];
    const shape = createShape(saved);
    try {
      expect(shapeIsValid(shape)).toBe(true);
      expect(meshBody(saved, shape).volume).toBeCloseTo(result.mesh.volume, 3);
    } finally {
      shape.delete();
    }
  },
);
it('creates a rotated rectangular open duct with the correct wall volume', () => {
  const path = penPath(
    [
      [0, 0, 0],
      [0, 0, 500],
    ],
    'Pysty',
  );
  const result = sweepPath(path, { ...options, profile: 'rectangle', rotation: 35, wall: 2 });
  expect(result.mesh.volume).toBeCloseTo((20 * 40 - 16 * 36) * 500, 3);
  expect(result.body.feature.height).toBeCloseTo(500, 4);
});
it('follows a spatial Bézier with no flattening to the ground plane', () => {
  const path = bezierPath(
    [
      [0, 0, 0],
      [150, 0, 0],
      [200, 200, 120],
      [350, 200, 120],
    ],
    'Kaari',
  );
  const result = sweepPath(path, { ...options, wall: 2 });
  expect(result.mesh.volume).toBeGreaterThan(30000);
  expect(result.body.feature.height).toBeGreaterThan(130);
});
it('follows a closed circular path and a sharp pencil elbow', () => {
  const ring = makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, 30]),
    0,
    'Rengas',
    'construction',
  );
  expect(sweepPath(ring, options).mesh.volume).toBeCloseTo(2 * Math.PI ** 2 * 100 * 100, 2);
  const path = penPath(
    [
      [0, 0, 0],
      [200, 0, 0],
      [200, 200, 0],
    ],
    'Kulma',
  );
  expect(sweepPath(path, { ...options, wall: 2 }).mesh.volume).toBeGreaterThan(30000);
});
it('rejects zero inner width and solid paths without changing either input', () => {
  const path = penPath(
    [
      [0, 0, 0],
      [200, 0, 0],
    ],
    'Viiva',
  );
  expect(() => sweepPath(path, { ...options, wall: 10 })).toThrow('Seinämän');
  expect(() => sweepPath(makeBody(10, 10, 10), options)).toThrow('Valitse');
});
