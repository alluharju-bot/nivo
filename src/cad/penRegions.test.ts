import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea } from 'replicad';
import { makeProfileBody, type Vec3, freshProject, parseProject } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { fillPenRegions } from './penRegions';
import { penPath } from './paths';
import { createShape, meshBody } from './kernel';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const rectangle = () =>
  makeProfileBody(
    { kind: 'rectangle', width: 1000, depth: 1000 },
    sketchFrame([-500, -500, 0]),
    0,
    'Alue',
    'construction',
  );
const circle = () =>
  makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, -10]),
    0,
    'Kaivo',
    'construction',
  );
const radial = (x: number, y: number) =>
  penPath(
    [
      [x, y, 0],
      [(x / Math.hypot(x, y)) * 100, (y / Math.hypot(x, y)) * 100, -10],
    ],
    'Kaato',
  );

it('two radial pen strokes close sloped regions between a square and a lower circular drain', () => {
  const outline = rectangle(),
    drain = circle(),
    a = radial(500, 500),
    b = radial(-500, 500);
  expect(fillPenRegions(a, [outline, drain]).bodies).toHaveLength(0);
  const result = fillPenRegions(b, [outline, drain, a]);
  expect(result.bodies).toHaveLength(2);
  for (const body of result.bodies) {
    const shape = createShape(body);
    try {
      const mesh = meshBody(body, shape);
      expect(mesh.faces).toHaveLength(1);
      expect(mesh.curveEdges!.length).toBeGreaterThan(0);
      const faces = shape.faces;
      try {
        expect(measureArea(faces[0])).toBeGreaterThan(10000);
      } finally {
        faces.forEach((f) => f.delete());
      }
      expect(body.origin[2]).toBeGreaterThan(-11);
      expect(body.penRegion!.sources).toContain(b.id);
    } finally {
      shape.delete();
    }
  }
  const c = radial(-500, -500);
  const divided = fillPenRegions(c, [outline, drain, a, b], result.bodies);
  expect(divided.bodies).toHaveLength(3);
  expect(divided.replaceIds.sort()).toEqual(result.bodies.map((b) => b.id).sort());
  expect(
    fillPenRegions(
      c,
      [outline, drain, a, b],
      result.bodies.map((b) => ({ ...b, locked: true })),
    ).bodies,
  ).toHaveLength(0);
  expect(
    fillPenRegions(
      c,
      [outline, drain, a, b],
      result.bodies.map((b) => ({ ...b, origin: [b.origin[0], b.origin[1], 30] })),
    ).bodies,
  ).toHaveLength(0);
  const d = radial(500, -500);
  const all = fillPenRegions(d, [outline, drain, a, b, c], divided.bodies);
  expect(all.bodies).toHaveLength(4);
  // The center remains an open drain; no triangle spans across its hole.
  for (const body of all.bodies) {
    const shape = createShape(body);
    try {
      const mesh = meshBody(body, shape);
      for (let i = 0; i < mesh.triangles.length; i += 3) {
        const triangle = mesh.triangles
          .slice(i, i + 3)
          .map((v) => mesh.vertices.slice(v * 3, v * 3 + 2));
        const signs = triangle.map((a, k) => {
          const b = triangle[(k + 1) % 3];
          return a[0] * b[1] - a[1] * b[0];
        });
        expect(signs.every((n) => n > 1e-6) || signs.every((n) => n < -1e-6)).toBe(false);
      }
    } finally {
      shape.delete();
    }
  }
  expect(parseProject(JSON.stringify({ ...freshProject(), bodies: all.bodies })).bodies).toEqual(
    all.bodies,
  );
});

it('fills a nonplanar closed rectangle without flattening its four exact corners', () => {
  const points: Vec3[] = [
    [0, 0, 0],
    [500, 0, 0],
    [500, 400, -10],
    [0, 400, -20],
    [0, 0, 0],
  ];
  const result = fillPenRegions(penPath(points, 'Neljä kulmaa'), []);
  expect(result.bodies).toHaveLength(1);

  const shape = createShape(result.bodies[0]);
  try {
    const data = meshBody(result.bodies[0], shape);
    for (const p of points)
      expect(
        data.verticesCAD.some((v) => Math.hypot(...v.point.map((n, i) => n - p[i])) < 1e-5),
      ).toBe(true);
  } finally {
    shape.delete();
  }
});
