import { applySplitResult } from '../model/splitReferences';
import { resolveAnchor, guidePoints } from '../model/guides';
import { dimensionValue } from '../model/project';
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, freshProject, parseProject, type Body } from '../model/project';
import { createShape, meshBody } from './kernel';
import { sphereBody, bezierPath, knifeBodies, type KnifeRay } from './modeling';
import { splitWithPath } from './paths';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
function mesh(body: Body) {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
}
const ray = (x: number, y: number): KnifeRay => ({ origin: [x, y, 1000], direction: [0, 0, -1] });
it('creates an exact smooth sphere that roundtrips and can be cut into independent solids', () => {
  const sphere = sphereBody([100, 200, 300], 50, 'Pallo');
  const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [sphere] })).bodies[0];
  expect(saved.origin).toEqual([50, 150, 250]);
  expect(mesh(saved).volume).toBeCloseTo((4 * Math.PI * 50 ** 3) / 3, 3);
  const cut = knifeBodies([saved], [ray(100, 100), ray(100, 300)]);
  expect(cut.bodies).toHaveLength(2);
  expect(cut.affected).toEqual([saved.id]);
  for (const body of cut.bodies) expect(mesh(body).volume).toBeCloseTo(mesh(saved).volume / 2, 3);
});
it('knife preserves all material and identities, groups, appearance, and leaves unrelated bodies intact', () => {
  const box = {
    ...makeBody(600, 400, 100),
    name: 'Laatta',
    groupId: 'room',
    component: {
      id: 'linked',
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      offset: [0, 0, 0] as [number, number, number],
    },
  };
  const neighbour = makeBody(50, 50, 50, [1000, 0, 0]);
  const result = knifeBodies([box, neighbour], [ray(200, -100), ray(200, 500)]);
  expect(result.bodies).toHaveLength(3);
  expect(result.bodies[2]).toBe(neighbour);
  expect(result.pieces).toHaveLength(2);
  expect(result.bodies[0].id).toBe(box.id);
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies.slice(0, 2).map((b) => b.groupId)).toEqual(['room', 'room']);
  expect(result.bodies.reduce((s, b) => s + mesh(b).volume, 0)).toBeCloseTo(24125000, 3);
  expect(knifeBodies([box], [ray(900, -100), ray(900, 500)]).affected).toEqual([]);
  expect(() => knifeBodies([{ ...box, locked: true }], [ray(200, -100), ray(200, 500)])).toThrow(
    /lukitus/,
  );
});
it('bent and closed silhouette strokes partition rather than discard the interior', () => {
  const box = makeBody(600, 400, 100);
  const bent = knifeBodies([box], [ray(200, -100), ray(350, 200), ray(200, 500)]);
  expect(bent.bodies).toHaveLength(2);
  expect(bent.bodies.reduce((s, b) => s + mesh(b).volume, 0)).toBeCloseTo(24000000, 3);
  const closed = knifeBodies(
    [box],
    [ray(100, 100), ray(300, 100), ray(300, 300), ray(100, 300), ray(100, 100)],
  );
  expect(closed.bodies).toHaveLength(2);
  expect(closed.bodies.reduce((s, b) => s + mesh(b).volume, 0)).toBeCloseTo(24000000, 3);
});
it('perspective cuts follow the camera rays at both the front and back of a solid', () => {
  const origin: [number, number, number] = [0, -1000, 300];
  const to = (p: [number, number, number]): KnifeRay => {
    const d = p.map((n, i) => n - origin[i]);
    const l = Math.hypot(...d);
    return { origin, direction: d.map((n) => n / l) as [number, number, number] };
  };
  const box = makeBody(600, 400, 500);
  const result = knifeBodies([box], [to([300, 0, -200]), to([300, 0, 800])]);
  expect(result.bodies).toHaveLength(2);
  const centers = result.bodies.map((b) => mesh(b));
  expect(centers.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(120000000, 2);
  // x increases with y along the view ray plane: a prism cut at x=300 would be wrong.
  expect(result.bodies.some((b) => Math.abs(b.feature.width - 420) < 1e-4)).toBe(true);
});
it('exact cubic Bézier wires split faces, and closed curves produce real faces', () => {
  const curve = bezierPath(
    [
      [200, 0, 100],
      [100, 100, 100],
      [300, 300, 100],
      [200, 400, 100],
    ],
    'Kaari',
  );
  expect(mesh(curve).faces).toHaveLength(0);
  expect(mesh(curve).edges.length).toBeGreaterThan(12);
  const split = splitWithPath(makeBody(600, 400, 100), 'z:max', curve);
  expect(split.unchanged).toBeUndefined();
  expect(mesh(split.body).volume).toBeCloseTo(24000000, 3);
  const closed = bezierPath(
    [
      [0, 0, 0],
      [200, 0, 0],
      [200, 200, 0],
      [0, 200, 0],
      [-200, 200, 0],
      [-200, 0, 0],
      [0, 0, 0],
    ],
    'Lehti',
    true,
  );
  expect(mesh(closed).faces).toHaveLength(1);
  expect(() =>
    bezierPath(
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
      'Keskeneräinen',
    ),
  ).toThrow(/ohjauspiste/);
});

it('a split rebinds dimension and guide anchors to surviving vertices and edges on either piece', () => {
  const body = makeBody(600, 400, 100);
  const from = { bodyId: body.id, key: 'corner:0', local: [0, 0, 0] as [number, number, number] };
  const to = { bodyId: body.id, key: 'corner:4', local: [600, 0, 0] as [number, number, number] };
  const edge = { edge: { from, to, t: 0.25 } };
  const project = {
    ...freshProject(),
    bodies: [body],
    guides: [
      {
        id: 'measure',
        mode: 'free' as const,
        anchor: from,
        endAnchor: to,
        length: 600,
        plane: 'XY' as const,
        angle: 0,
      },
      {
        id: 'edge-guide',
        mode: 'guide' as const,
        anchor: edge,
        length: 100,
        plane: 'XY' as const,
        angle: 90,
      },
    ],
    dimensions: [
      {
        id: 'overall',
        bodyId: body.id,
        axis: 'x' as const,
        from: 'min' as const,
        to: 'max' as const,
      },
    ],
  };
  const cut = knifeBodies([body], [ray(200, -100), ray(200, 500)]);
  const next = applySplitResult(project, cut);
  expect(guidePoints(next.bodies, next.guides[0])).toEqual([
    [0, 0, 0],
    [600, 0, 0],
  ]);
  expect(resolveAnchor(next.bodies, next.guides[1].anchor)).toEqual([expect.closeTo(150, 8), 0, 0]);
  expect(dimensionValue(next, next.dimensions[0])).toBeCloseTo(600, 5);
  const small = next.bodies.find((b) => b.feature.width < 300)!;
  const moved = next.bodies.map((b) =>
    b.id === small.id
      ? { ...b, origin: [b.origin[0], b.origin[1] + 50, b.origin[2]] as [number, number, number] }
      : b,
  );
  expect(guidePoints(moved, next.guides[0])).toEqual([
    [0, 50, 0],
    [600, 0, 0],
  ]);
  expect(resolveAnchor(moved, next.guides[1].anchor)).toEqual([expect.closeTo(150, 8), 50, 0]);
});

it('knife broad phase skips distant parts and tangent strokes without altering them', () => {
  const parts = Array.from({ length: 296 }, (_, i) =>
    makeBody(50, 50, 50, [1000 + (i % 10) * 100, Math.floor(i / 10) * 100, 0]),
  );
  const result = knifeBodies(parts, [ray(200, -100), ray(200, 500)]);
  expect(result.affected).toEqual([]);
  expect(result.bodies).toEqual(parts);
  const tangent = makeBody(600, 400, 100);
  expect(knifeBodies([tangent], [ray(0, -100), ray(0, 500)]).affected).toEqual([]);
});

it('analytic Bézier knife keeps one smooth curved wall instead of a faceted chain', () => {
  const body = makeBody(600, 400, 100);
  const controls = [ray(200, -100), ray(50, 100), ray(400, 300), ray(200, 500)];
  const cut = knifeBodies([body], controls, [0, 0, -1]);
  expect(cut.bodies).toHaveLength(2);
  expect(
    Math.abs(cut.bodies.reduce((sum, b) => sum + mesh(b).volume, 0) - 24000000) / 24000000,
  ).toBeLessThan(1e-7);
  for (const body of cut.bodies) {
    const m = mesh(body);
    expect(m.faces.filter((f) => !f.planar)).toHaveLength(1);
    expect(m.faces.length).toBeLessThan(8);
  }
});

it('analytic curved knife also follows perspective projection without planar facets', () => {
  const origin: [number, number, number] = [0, -1000, 300];
  const targets: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [200, 0, -100],
    [50, 0, 100],
    [400, 0, 300],
    [200, 0, 700],
  ];
  const rays = targets.map((p) => {
    const d = p.map((n, i) => n - origin[i]),
      length = Math.hypot(...d);
    return { origin, direction: d.map((n) => n / length) as [number, number, number] };
  });
  const cut = knifeBodies([makeBody(600, 400, 500)], rays, [0, 1, 0]);
  expect(cut.bodies).toHaveLength(2);
  expect(
    Math.abs(cut.bodies.reduce((sum, b) => sum + mesh(b).volume, 0) - 120000000) / 120000000,
  ).toBeLessThan(1e-7);
  expect(mesh(cut.bodies[0]).faces.filter((f) => !f.planar)).toHaveLength(1);
});
