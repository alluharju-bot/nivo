import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, draw, type Sketch } from 'replicad';
import { makeBody, makeProfileBody, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, bodyFromShape, solidVolume, shapeIsValid, meshBody } from './kernel';
import { booleanBodies } from './operations';
import { cutOpening } from './paths';
import { singleOpening } from '../model/openingPattern';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

function volume(body: Body) {
  const shape = createShape(body);
  try {
    return solidVolume(shape);
  } finally {
    shape.delete();
  }
}

it('cuts a tube with 90 radial capsule tools, including coincident opposite copies', () => {
  const outer = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 700);
  const inner = makeProfileBody({ kind: 'circle', radius: 197 }, sketchFrame([0, 0, -1]), 702);
  const tube = booleanBodies([outer], [inner], 'cut')[0];
  const sketch = draw([-7.5, -35])
    .lineTo([-7.5, 35])
    .threePointsArcTo([7.5, 35], [0, 42.5])
    .lineTo([7.5, -35])
    .threePointsArcTo([-7.5, -35], [0, -42.5])
    .close()
    .sketchOnPlane('XZ') as Sketch;
  const capsule = sketch.extrude(450).translate([0, 225, 0]);
  const tools: Body[] = [];
  try {
    for (let row = 0; row < 5; row++)
      for (let column = 0; column < 18; column++) {
        const shape = capsule
          .clone()
          .rotate(column * 20, [0, 0, 0], [0, 0, 1])
          .translate([0, 0, 80 + row * 120]);
        try {
          tools.push(bodyFromShape(makeBody(), shape, []));
        } finally {
          shape.delete();
        }
      }
  } finally {
    capsule.delete();
  }
  const before = volume(tube);
  const single = booleanBodies([tube], [tools[0]], 'cut')[0];
  const result = booleanBodies([tube], tools, 'cut')[0];
  // The opposite copy cuts the same pair of openings: 45 distinct cuts, not 90.
  expect(Math.abs((before - volume(result)) / ((before - volume(single)) * 45) - 1)).toBeLessThan(
    0.005,
  );
  expect(volume(tube)).toBeCloseTo(before, 5);
  const shape = createShape(result);
  try {
    expect(shapeIsValid(shape)).toBe(true);
    const solids = shape.solids;
    expect(solids).toHaveLength(1);
    solids.forEach((s) => s.delete());
    expect(meshBody(result, shape).triangles.length).toBeGreaterThan(1000);
  } finally {
    shape.delete();
  }
}, 60000);

it('preserves overlapping and touching cuts, skips misses, and handles complete removal mid-batch', () => {
  const plate = makeBody(100, 100, 10);
  const tools = [
    makeBody(20, 100, 20, [20, 0, -5]),
    makeBody(20, 100, 20, [30, 0, -5]),
    makeBody(20, 100, 20, [50, 0, -5]),
    makeBody(10, 10, 10, [300, 0, 0]),
  ];
  expect(volume(booleanBodies([plate], tools, 'cut')[0])).toBeCloseTo(50000, 5);
  expect(volume(booleanBodies([plate], [...tools].reverse(), 'cut')[0])).toBeCloseTo(50000, 5);
  expect(booleanBodies([plate], [makeBody(100, 100, 10), ...tools], 'cut')).toEqual([]);
});

it('cuts a 90-opening pattern once per target, with accurate volume and locked off-target parts intact', () => {
  const plate = makeBody(920, 30, 3);
  const untouched = { ...makeBody(20, 20, 10, [0, 100, 0]), locked: true };
  const circle = makeProfileBody({ kind: 'circle', radius: 2 }, sketchFrame([10, 15, 3]), 0);
  const pattern = { ...singleOpening, count: 90, spacing: 10, direction: 'x' as const };
  const result = cutOpening(circle, [plate, untouched], pattern);
  expect(result.affected).toEqual([plate.id]);
  expect(result.bodies[1]).toBe(untouched);
  expect(result.cutters).toHaveLength(90);
  expect(volume(result.bodies[0])).toBeCloseTo(920 * 30 * 3 - 90 * Math.PI * 4 * 3, 4);
}, 60000);
