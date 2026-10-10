import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea } from 'replicad';
import { makeBody, makeProfileBody, freshProject, parseProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, pushPullFace, solidVolume } from './kernel';
import { booleanBodies } from './operations';
import { cutOpening } from './paths';
import { singleOpening, openingAngles } from '../model/openingPattern';
import { applyBoolean } from '../model/operations';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
function inspect<T>(body: Body, run: (shape: ReturnType<typeof createShape>) => T): T {
  const shape = createShape(body);
  try {
    return run(shape);
  } finally {
    shape.delete();
  }
}
const volume = (body: Body) => inspect(body, solidVolume);

it('joins four face-touching walls with door and window openings in a single selection', () => {
  const right = booleanBodies(
    [makeBody(100, 2077, 2350, [2038, -110, 0])],
    [makeBody(120, 800, 2370, [2028, 987, -10])],
    'cut',
  )[0];
  const left = booleanBodies(
    [makeBody(100, 1877, 2350, [-100, -10, 0])],
    [makeBody(120, 700, 350, [-110, 777, 1850])],
    'cut',
  )[0];
  const walls = [
    right,
    makeBody(2138, 100, 2350, [-100, -110, 0]),
    left,
    makeBody(2138, 100, 2350, [-100, 1867, 0]),
  ];
  const joined = booleanBodies(walls, [], 'join');
  expect(joined).toHaveLength(1);
  expect(volume(joined[0])).toBeCloseTo(
    walls.reduce((sum, b) => sum + volume(b), 0),
    1,
  );
  inspect(joined[0], (shape) => {
    const solids = shape.solids;
    expect(solids).toHaveLength(1);
    solids.forEach((s) => s.delete());
  });
  // A stale Cut setting must never leave input walls overlaid on the Join result.
  const project = applyBoolean(
    { ...freshProject(), bodies: walls },
    [walls[0].id],
    walls.slice(1).map((b) => b.id),
    joined,
    'join',
    true,
  );
  expect(project.bodies).toHaveLength(1);
  expect(parseProject(JSON.stringify(project)).bodies).toEqual(joined);
});

it('Join unions a rectangle and two circles into one exact capsule, ready for push/pull and cutting', () => {
  const forms = [
    makeBody(100, 40, 0),
    ...[0, 100].map((x) =>
      makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([x, 20, 0]), 0),
    ),
  ];
  const joined = booleanBodies(forms, [], 'join')[0];
  const reversedOrder = booleanBodies([forms[1], forms[0], forms[2]], [], 'join')[0];
  inspect(reversedOrder, (shape) =>
    expect(meshBody(reversedOrder, shape).faces[0].normal[2]).toBeCloseTo(1),
  );
  expect(joined.feature).toMatchObject({ solid: false, width: 140, depth: 40 });
  const area = 4000 + Math.PI * 400;
  inspect(joined, (shape) => {
    expect(measureArea(shape.asShape3D())).toBeCloseTo(area, 5);
    const faces = meshBody(joined, shape).faces;
    expect(faces).toHaveLength(1);
    expect(volume(pushPullFace(joined, faces[0].ref, 10))).toBeCloseTo(area * 10, 4);
  });
  const plate = makeBody(200, 100, 3, [-40, -30, -3]);
  expect(volume(cutOpening(joined, [plate]).bodies[0])).toBeCloseTo(60000 - area * 3, 4);
  expect(() => booleanBodies([forms[0], plate], [], 'join')).toThrow('keskenään');
  expect(() => booleanBodies([{ ...forms[0], locked: true }, forms[1]], [], 'join')).toThrow(
    'Vapauta',
  );
});

it('rotates each opening and its cut direction around a cylinder, preserving the opposite wall', () => {
  const outer = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 80);
  const inner = makeProfileBody({ kind: 'circle', radius: 97 }, sketchFrame([0, 0, -1]), 82);
  const tube = booleanBodies([outer], [inner], 'cut')[0];
  const profile = makeProfileBody(
    { kind: 'circle', radius: 4 },
    sketchFrame([100, 0, 40], [1, 0, 0]),
    0,
  );
  const pattern = {
    ...singleOpening,
    count: 7,
    depth: 5,
    radial: {
      pivot: [0, 0, 40] as [number, number, number],
      axis: 'z' as const,
      angle: 45,
      fullCircle: true,
    },
  };
  const one = cutOpening(profile, [tube], { ...singleOpening, depth: 5 });
  const result = cutOpening(profile, [tube], pattern);
  expect(result.cutters).toHaveLength(7);
  expect(result.affected).toEqual([tube.id]);
  const removed = volume(tube) - volume(one.bodies[0]);
  expect(removed).toBeGreaterThan(100);
  // OCCT integrates the curved cylinder/round-hole intersection numerically.
  expect(Math.abs((volume(tube) - volume(result.bodies[0])) / (removed * 7) - 1)).toBeLessThan(
    0.005,
  );
  for (const cutter of result.cutters) {
    const center = cutter.faces.reduce(
      (p, f) => p.map((v, i) => v + f.center[i] / cutter.faces.length),
      [0, 0, 0],
    );
    expect(Math.hypot(center[0], center[1])).toBeGreaterThan(94);
  }
  expect(openingAngles(pattern)).toHaveLength(7);
  expect(() =>
    openingAngles({ ...pattern, radial: { ...pattern.radial, fullCircle: false, angle: 90 } }),
  ).toThrow('päällekkäin');
  expect(() => cutOpening(profile, [{ ...tube, locked: true }], pattern)).toThrow('kiinnitettyyn');
  const partial = cutOpening(profile, [tube], {
    ...pattern,
    count: 2,
    radial: { ...pattern.radial, fullCircle: false, angle: 30 },
  });
  const repeated = cutOpening(partial.lastProfile, partial.bodies, {
    ...pattern,
    count: 1,
    first: 1,
    radial: { ...pattern.radial, fullCircle: false, angle: 30 },
  });
  const three = cutOpening(profile, [tube], {
    ...pattern,
    count: 3,
    radial: { ...pattern.radial, fullCircle: false, angle: 30 },
  });
  expect(volume(repeated.bodies[0])).toBeCloseTo(volume(three.bodies[0]), 4);
}, 20000);
