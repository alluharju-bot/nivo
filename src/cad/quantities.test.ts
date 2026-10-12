import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { makeCylinder, setOC } from 'replicad';
import { freshProject, makeBody, parseProject, type Body } from '../model/project';
import { assignPartType, quantityRows } from '../model/quantities';
import { bodyFromShape, createShape, meshBody } from './kernel';
import { detailEdges, removeEdgeTreatment } from './details';
import { rotateBodies } from './transforms';
import { scaleBodies } from './scaling';
import { instantiateComponents } from './components';
import { asComponent } from '../model/components';
import { cutDefaults } from '../model/cutSettings';
import { cuttingParts } from '../model/cutting';

vi.mock('brepjs-opencascade/src/brepjs_single.wasm?url', () => ({
  default: `${process.cwd()}/node_modules/brepjs-opencascade/src/brepjs_single.wasm`,
}));
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const types = [{ id: 'board', name: 'Laudelauta', unit: 'length' as const }];
const measured = (body: Body) =>
  assignPartType({ ...freshProject(), bodies: [body], partTypes: types }, [body.id], 'board')
    .bodies[0];
const quantity = (body: Body) => {
  const shape = createShape(body);
  try {
    const p = parseProject(JSON.stringify({ ...freshProject(), bodies: [body], partTypes: types }));
    return quantityRows(p, p.bodies, [meshBody(body, shape)])[0];
  } finally {
    shape.delete();
  }
};
it('keeps typed board lengths through fillets, arbitrary rotations, translation and reopening', () => {
  const body = measured(makeBody(2200, 90, 28));
  const rounded = detailEdges(body, [0], 'fillet', 3).body;
  const rotated = rotateBodies([rounded], [0, 0, 0], [1, 2, 3], 37)[0];
  const moved = {
    ...rotated,
    origin: rotated.origin.map((n) => n + 100) as [number, number, number],
  };
  expect(quantity(moved)).toMatchObject({ total: 2.2, missing: 0 });
  const project = { ...freshProject(), bodies: [moved], partTypes: types };
  expect(cuttingParts(project, [moved], [], cutDefaults)[0].dimensions).toEqual([2200, 90, 28]);
});
it('recognizes an already rotated cuboid when a type is first assigned', () => {
  const rotated = {
    ...rotateBodies([makeBody(2200, 90, 28)], [0, 0, 0], [0, 0, 1], 37)[0],
    quantityBasis: undefined,
  };
  const shape = createShape(rotated);
  try {
    const p = assignPartType(
      { ...freshProject(), bodies: [rotated], partTypes: types },
      [rotated.id],
      'board',
      [meshBody(rotated, shape)],
    );
    expect(quantity(p.bodies[0]).total).toBeCloseTo(2.2, 6);
  } finally {
    shape.delete();
  }
});
it('updates stock lengths after scaling and linked propagation but preserves independent type assignments', async () => {
  const source = measured(asComponent(makeBody(2200, 90, 28)));
  const target = rotateBodies(
    [{ ...source, id: 'copy', partTypeId: undefined, origin: [3000, 0, 0] }],
    [3000, 0, 0],
    [0, 0, 1],
    90,
  )[0];
  const scaled = (await scaleBodies([source], [0, 0, 0], [1.5, 1, 1]))[0];
  expect(quantity(scaled).total).toBeCloseTo(3.3, 6);
  const placed = instantiateComponents(scaled, [target])[0];
  expect(placed.partTypeId).toBeUndefined();
  expect(placed.quantityBasis?.dimensions[0]).toBeCloseTo(3300, 5);
});
it('keeps roundovers and cut holes at gross stock area, and updates dimensions after a real trim', () => {
  const body = measured(makeBody(2200, 90, 28)),
    shape = createShape(body);
  const hole = makeCylinder(10, 50, [300, 45, -10]);
  const result = shape.asShape3D().cut(hole);
  const drilled = bodyFromShape(body, result);
  expect(quantity(drilled)).toMatchObject({ total: 2.2, missing: 0 });
  result.delete();
  hole.delete();
  shape.delete();
  const trimmedShape = createShape(makeBody(2100, 90, 28));
  const trimmed = bodyFromShape(drilled, trimmedShape);
  expect(quantity(trimmed)).toMatchObject({ total: 2.1, missing: 0 });
  trimmedShape.delete();
});

it('measures edited stock in its own rotated frame rather than world extents', () => {
  const board = measured(makeBody(2200, 90, 28));
  const rotated = rotateBodies([board], [0, 0, 0], [1, 2, 3], 37)[0];
  const smaller = rotateBodies([makeBody(2100, 90, 28)], [0, 0, 0], [1, 2, 3], 37)[0];
  const shape = createShape(smaller);
  try {
    const cut = bodyFromShape(rotated, shape);
    expect(quantity(cut).total).toBeCloseTo(2.1, 6);
    const p = {
      ...freshProject(),
      bodies: [cut],
      partTypes: [{ ...types[0], unit: 'area' as const }],
    };
    expect(quantityRows(p, p.bodies, [])[0].total).toBeCloseTo(0.189, 8);
  } finally {
    shape.delete();
  }
});

it('measures the enclosing orthogonal blank after an oblique stretch', async () => {
  const board = rotateBodies([measured(makeBody(200, 90, 28))], [0, 0, 0], [0, 0, 1], 37)[0];
  const scaled = (await scaleBodies([board], [0, 0, 0], [1.5, 1, 1]))[0];
  const row = quantity(scaled);
  expect(row.missing).toBe(0);
  expect(row.parts[0].dimensions![0]).toBeGreaterThan(200);
  expect(row.parts[0].dimensions![1]).toBeGreaterThan(90);
  expect(row.parts[0].dimensions![2]).toBeCloseTo(28);
});

it('captures all three profiled panel dimensions on old projects and keeps the longest axis after trimming', async () => {
  const { makePolygonBody } = await import('../model/project');
  const { captureQuantityBases } = await import('../model/quantityBasis');
  const profile = makePolygonBody([
    [0, 0, 0],
    [48, 0, 0],
    [48, 13, 0],
    [44, 18, 0],
    [4, 18, 0],
    [0, 13, 0],
  ]);
  const panel = {
    ...profile,
    partTypeId: 'board',
    feature: { ...profile.feature, height: 2350 },
    quantityBasis: undefined,
  };
  const shape = createShape(panel);
  try {
    const project = captureQuantityBases({ ...freshProject(), partTypes: types, bodies: [panel] }, [
      meshBody(panel, shape),
    ]);
    expect(project.bodies[0].quantityBasis?.dimensions).toEqual([2350, 48, 18]);
    expect(quantity(project.bodies[0]).total).toBeCloseTo(2.35, 8);
    const shortened = (await scaleBodies(project.bodies, [0, 0, 0], [1, 1, 0.01]))[0];
    expect(shortened.quantityBasis?.dimensions).toEqual([48, 23.5, 18]);
    expect(quantity(shortened).total).toBeCloseTo(0.048, 8);
  } finally {
    shape.delete();
  }
});

it.each(['fillet', 'chamfer'] as const)(
  '%s retains automatic and explicit stock dimensions and cutting allowances without review',
  async (operation) => {
    const { setQuantityDimensions, preserveDetailBlanks } = await import('../model/quantities');
    const { cutGeometryKey } = await import('../model/cutting');
    const source = measured(makeBody(2200, 90, 28));
    const before = setQuantityDimensions(
      { ...freshProject(), bodies: [source], partTypes: types },
      source.id,
      [2250, 100, 30],
    );
    before.settings.cutting = {
      ...cutDefaults,
      parts: {
        [source.id]: {
          blank: { dimensions: [2250, 100, 30], geometryKey: cutGeometryKey(source) },
        },
      },
    };
    const result = detailEdges(before.bodies[0], [0], operation, 3).body;
    expect(quantity(result)).toMatchObject({ total: 2.25, missing: 0 });
    const after = preserveDetailBlanks(before, { ...before, bodies: [result] });
    const legacyBody = { ...result, quantityBasis: before.bodies[0].quantityBasis };
    const legacy = { ...before, bodies: [legacyBody] };
    const repaired = preserveDetailBlanks(legacy, legacy);
    expect(quantity(legacyBody)).toMatchObject({ total: 2.25, missing: 0 });
    expect(
      cuttingParts(repaired, repaired.bodies, [], repaired.settings.cutting!)[0].issue,
    ).toBeUndefined();
    const stock = cuttingParts(after, after.bodies, [], after.settings.cutting!)[0];
    expect(stock.dimensions).toEqual([2250, 100, 30]);
    expect(stock.issue).toBeUndefined();
    const edited = detailEdges(result, [0], operation, 4, true).body;
    const again = preserveDetailBlanks(after, { ...after, bodies: [edited] });
    expect(cuttingParts(again, again.bodies, [], again.settings.cutting!)[0].dimensions).toEqual([
      2250, 100, 30,
    ]);
    expect(quantity(edited)).toMatchObject({ total: 2.25, missing: 0 });
    const removed = preserveDetailBlanks(again, {
      ...again,
      bodies: [removeEdgeTreatment(edited)],
    });
    expect(
      cuttingParts(removed, removed.bodies, [], removed.settings.cutting!)[0].dimensions,
    ).toEqual([2250, 100, 30]);
  },
);

it('preserves cutting allowances in rotated linked copies after rounding, without revalidating unrelated cuts', async () => {
  const { preserveDetailBlanks } = await import('../model/quantities');
  const { cutGeometryKey } = await import('../model/cutting');
  const source = measured(asComponent(makeBody(2200, 90, 28)));
  const copy = rotateBodies([{ ...source, id: 'turned' }], [0, 0, 0], [0, 0, 1], 37)[0];
  const before = { ...freshProject(), bodies: [source, copy], partTypes: types };
  before.settings.cutting = {
    ...cutDefaults,
    parts: Object.fromEntries(
      before.bodies.map((body) => [
        body.id,
        {
          blank: {
            dimensions: [2250, 100, 30] as [number, number, number],
            geometryKey: cutGeometryKey(body),
          },
        },
      ]),
    ),
  };
  const rounded = detailEdges(source, [0], 'fillet', 3).body;
  const after = preserveDetailBlanks(before, {
    ...before,
    bodies: [rounded, ...instantiateComponents(rounded, [copy])],
  });
  expect(
    cuttingParts(after, after.bodies, [], after.settings.cutting!).every(
      (p) => !p.issue && p.dimensions?.[0] === 2250,
    ),
  ).toBe(true);
  expect(quantityRows(after, after.bodies, [])[0]).toMatchObject({ total: 4.5, missing: 0 });
  const trimmed = { ...after, bodies: await scaleBodies(after.bodies, [0, 0, 0], [0.5, 0.5, 0.5]) };
  const checked = preserveDetailBlanks(after, trimmed);
  expect(
    cuttingParts(checked, checked.bodies, [], checked.settings.cutting!).every((p) => !!p.issue),
  ).toBe(true);
});
