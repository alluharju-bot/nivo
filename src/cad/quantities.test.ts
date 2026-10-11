import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { makeCylinder, setOC } from 'replicad';
import { freshProject, makeBody, parseProject, type Body } from '../model/project';
import { assignPartType, quantityRows } from '../model/quantities';
import { bodyFromShape, createShape, meshBody } from './kernel';
import { detailEdges } from './details';
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

it('requires new stock confirmation after an oblique nonuniform stretch that shears the stock frame', async () => {
  const board = rotateBodies([measured(makeBody(200, 90, 28))], [0, 0, 0], [0, 0, 1], 37)[0];
  const scaled = (await scaleBodies([board], [0, 0, 0], [1.5, 1, 1]))[0];
  expect(quantity(scaled).missing).toBe(1);
});
