import { beforeAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
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
import { surfaceLevels } from './surfaceLevels';
const profiles = () => [
  { ...makeBody(2110, 2750, 0), name: 'Lattian ulkoraja' },
  {
    ...makeBody(900, 900, 0),
    name: 'Suihkualue',
    origin: [100, 100, 0] as [number, number, number],
  },
  makeProfileBody({ kind: 'circle', radius: 50 }, sketchFrame([550, 550, 0]), 0, 'Kaivo'),
];
const options = { heights: [0, -10, -20], baseDepth: 60, openCenter: true, name: 'Kaatopinta' };
it('builds a closed solid with exact nested boundaries and a round drain', () => {
  const sources = profiles(),
    before = JSON.stringify(sources),
    result = surfaceLevels(sources, options);
  expect(JSON.stringify(sources)).toBe(before);
  expect(result.body.feature.type === 'brep' && result.body.feature.solid).toBe(true);
  expect(result.body.origin[2]).toBeCloseTo(-60, 6);
  expect(result.body.feature.height).toBeCloseTo(60, 6);
  expect(result.mesh.volume).toBeGreaterThan(200000000);
  const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }))
    .bodies[0];
  const restoredShape = createShape(restored);
  try {
    expect(meshBody(restored, restoredShape).volume).toBeCloseTo(result.mesh.volume, 3);
  } finally {
    restoredShape.delete();
  }
  if (process.env.NIVO_LEVEL_EXAMPLE)
    writeFileSync(
      process.env.NIVO_LEVEL_EXAMPLE,
      JSON.stringify({
        ...freshProject(),
        name: 'Korkeuspinta · lattia ja pyöreä kaivo',
        bodies: [
          ...sources.map((b, i) => ({
            ...b,
            name: ['Lattian ulkoraja', 'Suihkualue', 'Kaivo'][i],
            hidden: true,
          })),
          { ...result.body, name: 'Lattia · 0 / −10 / −20 mm', color: '#b9b4a8' },
        ],
      }),
    );
  expect(
    result.mesh.curveEdges?.some((e) => e.circle && Math.abs(e.circle.radius - 50) < 1e-6),
  ).toBe(true);
  expect(result.bands).toHaveLength(2);
  expect(result.bands.every((b) => b.min > 0 && b.max < 20)).toBe(true);
  const shape = createShape(result.body);
  try {
    expect(shapeIsValid(shape)).toBe(true);
  } finally {
    shape.delete();
  }
}, 30000);
it('updates existing boundaries without the source parts and supports a skin or closed centre', () => {
  const first = surfaceLevels(profiles(), options);
  const second = surfaceLevels([], { ...options, heights: [0, -15, -25] }, first.body);
  expect(second.body.id).toBe(first.body.id);
  expect(
    second.body.feature.type === 'brep' &&
      second.body.feature.surfaceLevels?.boundaries.map((b) => b.height),
  ).toEqual([0, -15, -25]);
  const skin = surfaceLevels([], { ...options, baseDepth: 0, openCenter: false }, second.body);
  expect(skin.body.feature.type === 'brep' && skin.body.feature.solid).toBe(false);
  expect(skin.mesh.faces.length).toBeGreaterThan(2);
}, 30000);
it('rejects touching, disjoint and wrongly ordered boundaries and insufficient base depth', () => {
  expect(() => surfaceLevels(profiles(), { ...options, baseDepth: 20 })).toThrow('Pohja');
  const p = profiles();
  p[1] = { ...p[1], origin: [0, 0, 0] };
  expect(() => surfaceLevels(p, options)).toThrow('koskettavat');
  expect(() => surfaceLevels(profiles().reverse(), options)).toThrow('sisäkkäin');
  const q = profiles();
  q[2] = { ...q[2], origin: [5000, 5000, 0] };
  expect(() => surfaceLevels(q, options)).toThrow('sisäkkäin');
  const first = surfaceLevels(profiles(), options);
  expect(() => surfaceLevels([], options, { ...first.body, locked: true })).toThrow('kiinnitetty');
}, 30000);

it('preserves editable heights through move, rotation, uniform scaling and rotated linked copies', async () => {
  const { rotateBodies } = await import('./transforms');
  const { scaleBodies } = await import('./scaling');
  const { asComponent } = await import('../model/components');
  const { instantiateComponents } = await import('./components');
  const first = asComponent(surfaceLevels(profiles(), options).body);
  const moved = {
    ...first,
    origin: first.origin.map((n, i) => n + [500, -300, 200][i]) as [number, number, number],
  };
  const rotated = rotateBodies([moved], [0, 0, 0], [1, 0, 0], 90)[0];
  const edited = surfaceLevels([], { ...options, heights: [0, -12, -22] }, rotated);
  expect(edited.body.feature.depth).toBeCloseTo(60, 5);
  expect(edited.mesh.volume).toBeGreaterThan(0);
  const [scaled] = await scaleBodies([rotated], [0, 0, 0], [2, 2, 2]);
  const recipe = scaled.feature.type === 'brep' ? scaled.feature.surfaceLevels! : undefined;
  expect(recipe?.boundaries.map((b) => b.height)).toEqual([0, -20, -40]);
  expect(recipe?.baseDepth).toBe(120);
  const rebuilt = surfaceLevels([], { ...options, heights: [0, -20, -40], baseDepth: 120 }, scaled);
  expect(rebuilt.body.feature.depth).toBeCloseTo(120, 5);
  const [copy] = instantiateComponents(first, [{ ...rotated, id: 'rotated-copy' }]);
  const copyRecipe = copy.feature.type === 'brep' ? copy.feature.surfaceLevels : undefined;
  expect(copyRecipe?.normal[1]).toBeCloseTo(-1, 6);
  const copyEdited = surfaceLevels([], options, copy);
  expect(copyEdited.body.feature.depth).toBeCloseTo(60, 5);
}, 30000);

it('attached measurements follow a boundary through consecutive height edits and file reload', async () => {
  const { resolveAnchor } = await import('../model/guides');
  const first = surfaceLevels(profiles(), options);
  const corner = first.mesh.verticesCAD.find((v) =>
    v.point.every((n, i) => Math.abs(n - [100, 100, -10][i]) < 1e-5),
  )!;
  expect(corner).toBeDefined();
  const second = surfaceLevels([], { ...options, heights: [0, -15, -25] }, first.body);
  const third = surfaceLevels([], { ...options, heights: [0, -18, -28] }, second.body);
  const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [third.body] }));
  expect(resolveAnchor(saved.bodies, corner.anchor)).toEqual([100, 100, -18]);
});
