import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeBezierCurve, makeLine, assembleWire } from 'replicad';
import { bodyFromShape } from './kernel';
import { revolveProfile, restoreRevolutionProfile } from './revolution';
import { makeProfileBody, makeBody, freshProject, parseProject } from '../model/project';
import { bezierPath } from './modeling';
import { rotateBodies } from './transforms';
import { scaleBodies } from './scaling';
import { instantiateComponents } from './components';
import { asComponent } from '../model/components';
import { translateSelection } from '../model/groups';
import type { RevolutionOptions } from '../model/revolution';
import { alignBodies } from './alignment';
import { defaultAlignment } from '../model/alignment';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const options: RevolutionOptions = {
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  angle: 360,
  name: 'Pyörähdys',
};
const profile = () =>
  makeProfileBody(
    { kind: 'rectangle', width: 20, depth: 40 },
    { origin: [10, 0, 0], u: [1, 0, 0], normal: [0, -1, 0] },
    0,
    'Profiili',
  );
const volume = Math.PI * (30 ** 2 - 10 ** 2) * 40;
it.each([360, 180, -90])(
  'revolves a closed offset profile %s degrees with exact volume and persistent recipe',
  (angle) => {
    const source = profile(),
      original = JSON.stringify(source);
    const result = revolveProfile(source, { ...options, angle });
    expect(result.mesh.volume).toBeCloseTo((volume * Math.abs(angle)) / 360, 3);
    expect(JSON.stringify(source)).toBe(original);
    const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }))
      .bodies[0];
    const recipe = saved.feature.type === 'brep' && saved.feature.revolution;
    expect(recipe).toBeTruthy();
    expect(revolveProfile(undefined, { ...options, angle: 90 }, saved).mesh.volume).toBeCloseTo(
      volume / 4,
      3,
    );
  },
);
it('creates a surface from an open Bézier and a torus from a circle', () => {
  const curve = bezierPath(
    [
      [20, 0, 0],
      [40, 0, 15],
      [5, 0, 40],
      [15, 0, 50],
    ],
    'Käyrä',
  );
  const result = revolveProfile(curve, options);
  expect(result.mesh.triangles.length).toBeGreaterThan(30);
  expect(result.body.feature.type === 'brep' && result.body.feature.solid).toBe(false);
  const restored = restoreRevolutionProfile(result.body);
  restored.curve!.points.forEach((p, j) =>
    p.forEach((n, i) =>
      expect(n + restored.origin[i]).toBeCloseTo(curve.curve!.points[j][i] + curve.origin[i], 10),
    ),
  );
  const circle = makeProfileBody(
    { kind: 'circle', radius: 5 },
    { origin: [40, 0, 0], u: [1, 0, 0], normal: [0, -1, 0] },
    0,
    'Ympyrä',
  );
  expect(revolveProfile(circle, options).mesh.volume).toBeCloseTo(2 * Math.PI ** 2 * 40 * 25, 3);
});

it('revolves mixed straight and Bézier boundaries as one closed profile', () => {
  const edges = [
    makeBezierCurve([
      [20, 0, 0],
      [40, 0, 15],
      [35, 0, 35],
      [20, 0, 50],
    ]),
    makeLine([20, 0, 50], [5, 0, 50]),
    makeLine([5, 0, 50], [5, 0, 0]),
    makeLine([5, 0, 0], [20, 0, 0]),
  ];
  const wire = assembleWire(edges);
  try {
    const p = bodyFromShape({ ...makeBody(1, 1, 1), name: 'Yhdistelmä' }, wire, []);
    const full = revolveProfile(p, options),
      half = revolveProfile(p, { ...options, angle: 180 });
    expect(full.mesh.volume).toBeGreaterThan(20000);
    expect(half.mesh.volume).toBeCloseTo(full.mesh.volume / 2, 2);
  } finally {
    wire.delete();
    edges.forEach((e) => e.delete());
  }
});

it('rejects profiles crossing the axis instead of accepting an overlapping solid', () => {
  const p = profile();
  p.origin[0] = -10;
  expect(() => revolveProfile(p, options)).toThrow();
});
it('retains editable profiles after translation, rotation, uniform scaling and linked instancing', async () => {
  const made = asComponent(revolveProfile(profile(), options).body);
  let moved = translateSelection({ ...freshProject(), bodies: [made] }, [made.id], [100, 200, 300])
    .project.bodies[0];
  moved = rotateBodies([moved], [100, 200, 300], [0, 1, 0], 45)[0];
  moved = (await scaleBodies([moved], [100, 200, 300], [2, 2, 2]))[0];
  const recipe = moved.feature.type === 'brep' && moved.feature.revolution;
  if (!recipe) throw new Error('Missing recipe');
  const restored = revolveProfile(
    undefined,
    {
      ...options,
      origin: recipe.origin.map((n, i) => n + moved.origin[i]) as [number, number, number],
      axis: recipe.axis,
    },
    moved,
  );
  expect(restored.mesh.volume).toBeCloseTo(volume * 8, 2);
  restored.body.origin.forEach((n, i) => expect(n).toBeCloseTo(moved.origin[i], 4));
  const linked = instantiateComponents(moved, [{ ...made, origin: [500, 100, 0] }])[0];
  expect(linked.feature.type === 'brep' && linked.feature.revolution).toBeTruthy();
});
it('rejects degenerate inputs and locked modifications without changing the original', () => {
  expect(() => revolveProfile(makeBody(10, 10, 10), options)).toThrow(/paksuudeton/);
  expect(() => revolveProfile(profile(), { ...options, angle: 0 })).toThrow(/kulma/);
  expect(() => revolveProfile(profile(), { ...options, axis: [0, 0, 0] })).toThrow(/akseli/);
  const made = revolveProfile(profile(), options).body;
  expect(() => revolveProfile(undefined, options, { ...made, locked: true })).toThrow(/lukitus/);
});
it('aligns a rigid selection to bounds and preserves disabled world coordinates', () => {
  const parts = [makeBody(20, 10, 30, [0, 0, 7]), makeBody(10, 10, 30, [30, 0, 7])];
  const target = makeBody(100, 200, 400, [100, 300, 700]);
  expect(alignBodies(parts, target, defaultAlignment())).toEqual([130, 395, 0]);
  const opts = defaultAlignment();
  opts.axes = [false, false, true];
  opts.source[2] = 'min';
  opts.target[2] = 'max';
  expect(alignBodies(parts, target, opts)).toEqual([0, 0, 1093]);
  expect(() => alignBodies(parts, parts[0], opts)).toThrow(/muu/);
});
it('measures a rotated target in its own frame rather than its world bounding box', () => {
  const target = rotateBodies([makeBody(100, 20, 30)], [0, 0, 0], [0, 0, 1], 30)[0];
  const source = rotateBodies([makeBody(10, 4, 5, [160, 8, 0])], [0, 0, 0], [0, 0, 1], 30)[0];
  const opts = defaultAlignment();
  opts.frame = 'target';
  opts.axes = [true, false, false];
  const delta = alignBodies([source], target, opts);
  expect(delta[0]).toBeCloseTo(-115 * Math.cos(Math.PI / 6), 4);
  expect(delta[1]).toBeCloseTo(-115 * Math.sin(Math.PI / 6), 4);
  expect(delta[2]).toBeCloseTo(0, 7);
});
