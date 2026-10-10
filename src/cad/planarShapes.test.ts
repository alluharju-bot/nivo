import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea, type Shape3D } from 'replicad';
import { makeBody, makeProfileBody, freshProject, parseProject, type Body } from '../model/project';
import { sketchFrame, fromUV } from '../model/sketch';
import { createShape, meshBody, pushPullFace } from './kernel';
import { mergePlanarBodies, offsetFace, offsetOutline } from './operations';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

function inspect(body: Body) {
  const shape = createShape(body),
    faces = shape.faces;
  try {
    return {
      mesh: meshBody(body, shape),
      area: measureArea(shape as Shape3D),
      faceAreas: faces.map((f) => measureArea(f)),
    };
  } finally {
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}

it('extends a flat rectangle outward and makes a selectable rim that can be raised into walls', () => {
  const floor = makeBody(100, 80, 0, [30, -40, -13]);
  const lines = offsetOutline(floor, 'z:max', -10);
  expect(Math.min(...lines.filter((_, i) => i % 3 === 0))).toBeCloseTo(20, 6);
  const offset = offsetFace(floor, 'z:max', -10);
  const flat = inspect(offset.body);
  expect(flat.area).toBeCloseTo(120 * 100, 5);
  flat.faceAreas.sort((a, b) => a - b).forEach((a, i) => expect(a).toBeCloseTo([4000, 8000][i], 6));
  expect(offset.body.origin).toEqual([20, -50, -13]);
  const walls = pushPullFace(offset.body, offset.face, 30);
  const raised = inspect(walls);
  expect(raised.mesh.volume).toBeCloseTo(4000 * 30, 5);
  expect(raised.mesh.faces.some((f) => f.planar && Math.abs(f.center[2] + 13) < 1e-6)).toBe(true);
  expect(parseProject(JSON.stringify({ ...freshProject(), bodies: [walls] })).bodies[0]).toEqual(
    walls,
  );
});

it('unites overlapping rectangles into one L-shaped face without internal edges, then offsets its entire perimeter', () => {
  const parts = [makeBody(100, 60, 0), makeBody(60, 100, 0)];
  const union = mergePlanarBodies(parts);
  const shape = inspect(union);
  expect(shape.area).toBeCloseTo(8400, 6);
  expect(shape.mesh.faces).toHaveLength(1);
  expect(shape.mesh.edgesCAD).toHaveLength(6);
  const offset = offsetFace(union, shape.mesh.faces[0].ref, -10);
  expect(inspect(offset.body).area).toBeCloseTo(12800, 5);
  expect(inspect(pushPullFace(offset.body, offset.face, 25)).mesh.volume).toBeCloseTo(4400 * 25, 4);
});

it('keeps exact circular arcs when merging curved and straight shapes', () => {
  const rectangle = makeBody(100, 100, 0);
  const circle = makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([100, 50, 0]));
  const merged = mergePlanarBodies([rectangle, circle]);
  const shape = inspect(merged);
  expect(shape.area).toBeCloseTo(10000 + 200 * Math.PI, 5);
  expect(shape.mesh.faces).toHaveLength(1);
  expect(shape.mesh.curveEdges?.length).toBeGreaterThan(0);
  const offset = offsetFace(circle, inspect(circle).mesh.faces[0].ref, -10);
  expect(inspect(offset.body).area).toBeCloseTo(900 * Math.PI, 5);
  expect(inspect(pushPullFace(offset.body, offset.face, 10)).mesh.volume).toBeCloseTo(
    5000 * Math.PI,
    4,
  );
});

it('preserves an inner courtyard when merging rectangles and extending only the outside boundary', () => {
  const frame = mergePlanarBodies([
    makeBody(100, 20, 0),
    makeBody(100, 20, 0, [0, 80, 0]),
    makeBody(20, 100, 0),
    makeBody(20, 100, 0, [80, 0, 0]),
  ]);
  const original = inspect(frame);
  expect(original.area).toBeCloseTo(6400, 5);
  expect(original.mesh.faces).toHaveLength(1);
  const offset = offsetFace(frame, original.mesh.faces[0].ref, -10);
  expect(inspect(offset.body).area).toBeCloseTo(14400 - 3600, 5);
  expect(inspect(pushPullFace(offset.body, offset.face, 20)).mesh.volume).toBeCloseTo(4400 * 20, 4);
});

it('supports oblique planes, containment, identical shapes and disconnected islands', () => {
  const frame = sketchFrame([20, -30, 50], [0, -0.6, 0.8]);
  const rectangle = makeProfileBody({ kind: 'rectangle', width: 100, depth: 80 }, frame);
  const inside = makeProfileBody(
    { kind: 'circle', radius: 10 },
    { ...frame, origin: fromUV([40, 40], frame) },
  );
  const merged = mergePlanarBodies([rectangle, inside, { ...rectangle, id: 'duplicate' }]);
  expect(inspect(merged).area).toBeCloseTo(8000, 5);
  const offset = offsetFace(merged, inspect(merged).mesh.faces[0].ref, -10);
  expect(inspect(offset.body).area).toBeCloseTo(12000, 5);
  const islands = mergePlanarBodies([makeBody(10, 10, 0), makeBody(10, 10, 0, [20, 0, 0])]);
  expect(inspect(islands).area).toBeCloseTo(200, 6);
  expect(inspect(islands).mesh.faces).toHaveLength(2);
});

it('keeps existing surface divisions when extending a previously inset floor', () => {
  const floor = offsetFace(makeBody(100, 80, 0), 'z:max', 10).body;
  const shape = inspect(floor);
  const rim = shape.mesh.faces.find((f) => Math.abs(shape.faceAreas[f.index] - 3200) < 1e-6)!;
  const outside = offsetFace(floor, rim.ref, -10);
  inspect(outside.body)
    .faceAreas.sort((a, b) => a - b)
    .forEach((a, i) => expect(a).toBeCloseTo([3200, 4000, 4800][i], 6));
});

it('rejects different planes, solids, locked shapes and invalid offsets without changing inputs', () => {
  const plane = makeBody(100, 100, 0),
    original = JSON.stringify(plane);
  expect(() => mergePlanarBodies([plane, makeBody(100, 100, 0, [0, 0, 1])])).toThrow(
    'samalla tasolla',
  );
  expect(() => mergePlanarBodies([plane, makeBody(100, 100, 10)])).toThrow('ilman paksuutta');
  expect(() => mergePlanarBodies([plane, { ...plane, id: 'locked', locked: true }])).toThrow(
    'kiinnitetyt',
  );
  expect(() => offsetFace(makeBody(100, 100, 10), 'z:max', -10)).toThrow('ilman paksuutta');
  expect(() => offsetFace(plane, 'z:max', 0)).toThrow();
  expect(() => offsetFace(plane, 'z:max', -Infinity)).toThrow();
  expect(JSON.stringify(plane)).toBe(original);
});
