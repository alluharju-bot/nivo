import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { measureArea, setOC, type Shape3D } from 'replicad';
import { createShape, meshBody, pushPullFace } from './kernel';
import { offsetFace, removeBoundary } from './operations';
import { measureFaceSpan } from './measurement';
import { penPath, splitWithPath } from './paths';
import { freshProject, makeBody, makeProfileBody, parseProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';

beforeAll(async () => {
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  );
}, 30000);

function inspect(body: Body) {
  const shape = createShape(body);
  try {
    return { mesh: meshBody(body, shape), area: measureArea(shape as Shape3D) };
  } finally {
    shape.delete();
  }
}

function saved(body: Body) {
  return parseProject(JSON.stringify({ ...freshProject(), bodies: [body] })).bodies[0];
}

it('preserves the 250 mm planar rim when lifting the centre of a 1000 mm square by 400 mm', () => {
  const source = makeBody(1000, 1000, 0);
  const inset = offsetFace(source, 'z:max', 250);
  expect(inspect(inset.body).mesh.faces).toHaveLength(2);
  const raised = saved(pushPullFace(inset.body, inset.face, 400));
  expect(raised.origin).toEqual([0, 0, 0]);
  expect(raised.feature).toMatchObject({ width: 1000, depth: 1000, height: 400 });
  const { mesh, area } = inspect(raised);
  expect(mesh.volume).toBeCloseTo(500 * 500 * 400, 3);
  expect(area).toBeCloseTo(750000 + 2 * 500 * 500 + 4 * 500 * 400, 3);
  expect(mesh.faces).toHaveLength(7);
  expect(mesh.verticesCAD.some(({ point }) => point.every((n) => n === 0))).toBe(true);
  expect(inspect(inset.body).mesh.faces).toHaveLength(2);
});

it('keeps the rim through another cap edit and lets the rim become a solid too', () => {
  const inset = offsetFace(makeBody(1000, 1000, 0), 'z:max', 250);
  const raised = saved(pushPullFace(inset.body, inset.face, 400));
  const cap = inspect(raised).mesh.faces.find((f) => Math.abs(f.center[2] - 400) < 1e-6)!;
  const taller = saved(pushPullFace(raised, cap.ref, 100));
  expect(taller.feature).toMatchObject({ width: 1000, depth: 1000, height: 500 });
  expect(inspect(taller).mesh.volume).toBeCloseTo(500 * 500 * 500, 3);
  const ring = inspect(taller).mesh.faces.find(
    (f) => f.normal[2] > 0.99 && Math.abs(f.center[2]) < 1e-6,
  )!;
  expect(ring).toBeDefined();
  expect(measureFaceSpan(taller, ring.ref)).toMatchObject({ solid: false, depth: 0 });
  const tallerCap = inspect(taller).mesh.faces.find((f) => f.center[2] > 499)!;
  expect(measureFaceSpan(taller, tallerCap.ref)).toMatchObject({ solid: true, depth: 500 });
  const stepped = saved(pushPullFace(taller, ring.ref, 100));
  expect(inspect(stepped).mesh.volume).toBeCloseTo(500 * 500 * 500 + 750000 * 100, 3);
});

it.each([400, -400])(
  'keeps the rim for a signed extrusion of %i mm on an inclined, translated sketch',
  (distance) => {
    const normal = [0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number];
    const source = makeProfileBody(
      { kind: 'rectangle', width: 1000, depth: 1000 },
      sketchFrame([1300, -700, 200], normal),
    );
    const inset = offsetFace(source, inspect(source).mesh.faces[0].ref, 250);
    const raised = saved(pushPullFace(inset.body, inset.face, distance));
    const result = inspect(raised);
    expect(result.mesh.volume).toBeCloseTo(100000000, 3);
    expect(result.area).toBeCloseTo(2050000, 3);
    for (const { point } of inspect(source).mesh.verticesCAD)
      expect(
        result.mesh.verticesCAD.some((v) => v.point.every((n, i) => Math.abs(n - point[i]) < 1e-6)),
      ).toBe(true);
    const flat = result.mesh.faces.find((f) => !measureFaceSpan(raised, f.ref).solid)!;
    expect(flat).toBeDefined();
  },
);

it('preserves a circular annulus when its centre is extruded', () => {
  const disk = makeProfileBody({ kind: 'circle', radius: 500 }, sketchFrame([0, 0, 0]));
  const inset = offsetFace(disk, inspect(disk).mesh.faces[0].ref, 250);
  const raised = saved(pushPullFace(inset.body, inset.face, 400));
  const { mesh, area } = inspect(raised);
  expect(raised.feature).toMatchObject({ width: 1000, depth: 1000, height: 400 });
  expect(mesh.volume).toBeCloseTo(Math.PI * 250 ** 2 * 400, 3);
  expect(area).toBeCloseTo(Math.PI * (500 ** 2 + 250 ** 2 + 2 * 250 * 400), 3);
  expect(mesh.faces.filter((face) => face.planar)).toHaveLength(3);
});

it('shortens an existing raised cap without removing its surrounding surface', () => {
  const inset = offsetFace(makeBody(1000, 1000, 0), 'z:max', 250);
  const raised = pushPullFace(inset.body, inset.face, 400);
  const cap = inspect(raised).mesh.faces.find((f) => f.center[2] > 399)!;
  const shortened = saved(pushPullFace(raised, cap.ref, -150));
  expect(shortened.feature).toMatchObject({ width: 1000, depth: 1000, height: 250 });
  expect(inspect(shortened).mesh.volume).toBeCloseTo(62500000, 3);
  expect(inspect(shortened).mesh.faces).toHaveLength(7);
});

it('adds material when a remaining loose surface is extruded in the negative direction', () => {
  const inset = offsetFace(makeBody(1000, 1000, 0), 'z:max', 250);
  const raised = pushPullFace(inset.body, inset.face, 400);
  const ring = inspect(raised).mesh.faces.find(
    (f) => f.normal[2] > 0.99 && Math.abs(f.center[2]) < 1e-6,
  )!;
  const stepped = saved(pushPullFace(raised, ring.ref, -100));
  expect(stepped.feature).toMatchObject({ width: 1000, depth: 1000, height: 500 });
  expect(stepped.origin).toEqual([0, 0, -100]);
  expect(inspect(stepped).mesh.volume).toBeCloseTo(175000000, 3);
});

it('can divide and erase a boundary on the remaining rim without changing the raised solid', () => {
  const inset = offsetFace(makeBody(1000, 1000, 0), 'z:max', 250);
  const raised = pushPullFace(inset.body, inset.face, 400);
  const ring = inspect(raised).mesh.faces.find(
    (f) => f.normal[2] > 0.99 && Math.abs(f.center[2]) < 1e-6,
  )!;
  const line = penPath(
    [
      [100, 0, 0],
      [100, 1000, 0],
    ],
    'Rajaus',
  );
  const divided = saved(splitWithPath(raised, ring.ref, line).body);
  const mesh = inspect(divided).mesh;
  expect(mesh.faces).toHaveLength(8);
  expect(mesh.volume).toBeCloseTo(100000000, 3);
  const merged = saved(removeBoundary(divided, mesh.boundaries[0].faces));
  expect(inspect(merged).mesh.faces).toHaveLength(7);
  expect(inspect(merged).mesh.volume).toBeCloseTo(100000000, 3);
});

it('keeps the existing thickness when offsetting and lifting a solid plate', () => {
  const inset = offsetFace(makeBody(1000, 1000, 18), 'z:max', 250);
  const raised = saved(pushPullFace(inset.body, inset.face, 400));
  expect(raised.feature).toMatchObject({ width: 1000, depth: 1000, height: 418 });
  expect(inspect(raised).mesh.volume).toBeCloseTo(118000000, 3);
});
