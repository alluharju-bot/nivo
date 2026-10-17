import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { prepareGeometry, commitGeometry } from './geometryEditing';
import { createShape, solidVolume, meshBody, pushPullFace } from './kernel';
import {
  geometryMatrix,
  transformGeometryPoints,
  geometryEdges,
  patchPoints,
  edgeLoop,
  curvedEdgeSelection,
  geometryMeshBody,
  validateGeometry,
} from '../model/geometryEditing';
import { defaultAppearance } from '../model/materials';
import { rotateBodies } from './transforms';
import { offsetFace, booleanBodies } from './operations';
import { pushPullMesh, meshFaceSpan } from '../model/meshPushPull';
import { meshBody as importedMeshBody, meshClosure } from '../exchange/mesh';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
function shapeInfo(body: ReturnType<typeof makeBody>) {
  const shape = createShape(body);
  try {
    return { volume: solidVolume(shape), mesh: meshBody(body, shape) };
  } finally {
    shape.delete();
  }
}
it('moves two corners to form a planar slope, preserves anchors and remains editable CAD', () => {
  const body = makeBody(100, 80, 20);
  const g = prepareGeometry(body);
  expect(g.points).toHaveLength(8);
  expect(g.exact).toBe(true);
  expect(geometryEdges(g)).toHaveLength(12);
  const ids = g.points.flatMap((p, i) => (p[0] === 100 && p[2] === 20 ? [i] : []));
  const points = transformGeometryPoints(
    g.points,
    ids,
    geometryMatrix('move', [0, 0, 10], [0, 0, 0]),
  );
  const changed = commitGeometry(body, points);
  const info = shapeInfo(changed);
  expect(changed.feature.type).toBe('brep');
  expect(info.mesh.faces).toHaveLength(6);
  expect(info.volume).toBeCloseTo(200000, 3);
  expect(Object.values(changed.vertexRefs ?? {}).some((p) => p[2] === 30)).toBe(true);
  const bottom = info.mesh.faces.find((f) => f.normal[2] < -0.99)!;
  const pulled = pushPullFace(changed, bottom.ref, 5);
  expect(shapeInfo(pulled).volume).toBeGreaterThan(info.volume);
  const inset = offsetFace(changed, bottom.ref, 2);
  expect(shapeInfo(inset.body).volume).toBeCloseTo(info.volume, 3);
});
it('keeps a symmetric polygon edge deformation symmetric through CAD acceptance and another edit', () => {
  let body = makeProfileBody(
    {
      kind: 'polygon',
      points: [
        [-300, 0],
        [-125, 175],
        [125, 175],
        [300, 0],
        [150, -370],
        [-150, -370],
      ],
    },
    sketchFrame([0, 0, 0]),
    250,
  );
  for (const target of [210, 190, 250]) {
    const g = prepareGeometry(body);
    const points = g.points.map(
      (p) => [p[0], p[1], p[1] < -369 && p[2] > 1 ? target : p[2]] as [number, number, number],
    );
    const next = commitGeometry(body, points);
    const info = shapeInfo(next);
    expect(next.feature.type === 'brep' && next.feature.solid).toBe(true);
    const top = info.mesh.faces.filter((f) => f.normal[2] > 0.9);
    // Deliberate patch boundaries survive later edits, even when flattened.
    expect(top).toHaveLength(2);
    for (const face of top) expect(face.normal[0]).toBeCloseTo(0, 6);
    const accepted = prepareGeometry(next);
    expect(() => validateGeometry(accepted, accepted.points)).not.toThrow();
    for (const p of accepted.points)
      expect(
        accepted.points.some((q) => Math.hypot(q[0] + p[0], q[1] - p[1], q[2] - p[2]) < 1e-4),
      ).toBe(true);
    body = next;
  }
});
it('does not turn coordinate rounding into asymmetric CAD creases on a symmetric deformation', () => {
  const body = makeProfileBody(
    {
      kind: 'polygon',
      points: [
        [0, 0],
        [80.123456, 200.345678],
        [520.456789, 200.345678],
        [600.580245, 0],
        [450.2901225, -350.125678],
        [150.2901225, -350.125678],
      ],
    },
    sketchFrame([0, 0, 0]),
    250,
  );
  const g = prepareGeometry(body);
  const points = g.points.map(
    ([x, y, z]) =>
      [
        x > 400 && y < -300 && z > 200 ? Math.fround(x) : x,
        x < 1 && z < 1 ? y - 3.6e-6 : y,
        y < -300 ? (z > 200 ? 190 : 60) : y > 200 ? (z > 200 ? 200 : 50) : z,
      ] as [number, number, number],
  );
  const changed = commitGeometry(body, points);
  const { mesh } = shapeInfo(changed);
  expect(mesh.faces.filter((f) => f.normal[2] > 0.9)).toHaveLength(2);
  expect(mesh.faces.filter((f) => f.normal[2] < -0.9)).toHaveLength(2);
  expect(mesh.faces.filter((f) => Math.abs(f.normal[2]) < 0.01)).toHaveLength(6);
  const accepted = prepareGeometry(changed);
  expect(() => validateGeometry(accepted, accepted.points)).not.toThrow();
});
it('keeps a nearly planar open surface valid without an artificial diagonal', () => {
  const body = makeBody(200, 120, 0);
  const g = prepareGeometry(body);
  const points = g.points.map(
    ([x, y, z]) => [x, y, x === 200 && y === 120 ? z + 4e-6 : z] as [number, number, number],
  );
  const changed = commitGeometry(body, points);
  expect(shapeInfo(changed).mesh.faces).toHaveLength(1);
});
it('scales only a selected face about its centre and keeps its paint on the moved face', () => {
  const body = { ...makeBody(100, 80, 60), faceMaterials: {} };
  const shape = createShape(body);
  const mesh = meshBody(body, shape);
  shape.delete();
  const face = mesh.faces.find((f) => f.normal[2] > 0.99)!;
  body.faceMaterials = {
    [face.index]: { color: '#ff0000', appearance: defaultAppearance('matte') },
  };
  const g = prepareGeometry(body),
    ids = patchPoints(g, face.start / 3);
  const points = transformGeometryPoints(
    g.points,
    ids,
    geometryMatrix('scale', [0.5, 0.5, 1], [50, 40, 60]),
  );
  const result = commitGeometry(body, points),
    info = shapeInfo(result);
  expect(info.volume).toBeCloseTo(280000, 2);
  const top = info.mesh.faces.find((f) => f.normal[2] > 0.99)!;
  expect(result.faceMaterials?.[top.index]?.color).toBe('#ff0000');
  expect(
    g.points
      .filter((p) => p[2] === 0)
      .every((p) => points.some((q) => q.every((n, i) => n === p[i]))),
  ).toBe(true);
});
it('supports a tilted part and exact open surface without forcing thickness', () => {
  const body = rotateBodies([makeBody(100, 80, 0)], [0, 0, 0], [1, 0, 0], 30)[0];
  const g = prepareGeometry(body);
  expect(g.exact).toBe(true);
  expect(g.solid).toBe(false);
  const ids = g.points.map((_, i) => i),
    points = transformGeometryPoints(g.points, ids, geometryMatrix('move', [-15, 0, 0], [0, 0, 0]));
  const result = commitGeometry(body, points);
  expect(result.feature.type === 'brep' && result.feature.solid).toBe(false);
});
it('requires an explicit separate mesh for curved CAD and supports boundary-loop scaling', () => {
  const circle = makeProfileBody(
    { kind: 'circle', radius: 30 },
    sketchFrame([0, 0, 0]),
    0,
    'Ympyrä',
    'model',
  );
  const g = prepareGeometry(circle);
  expect(g.exact).toBe(false);
  const edges = geometryEdges(g);
  const loop = edgeLoop(edges, 0);
  expect(loop.length).toBeGreaterThan(12);
  const points = transformGeometryPoints(
    g.points,
    loop,
    geometryMatrix('scale', [0.5, 0.5, 1], [0, 0, 0]),
  );
  expect(() => commitGeometry(circle, points)).toThrow('verkkokopiona');
  const result = commitGeometry(circle, points, true);
  expect(result.feature.type).toBe('mesh');
  expect(result.feature.width).toBeCloseTo(30, 1);
  expect(circle.feature.width).toBe(60);
});
it('selects a cylinder rim and continues push/pull after scaling its top face', () => {
  const cylinder = makeProfileBody(
    { kind: 'circle', radius: 30 },
    sketchFrame([500, -300, 50]),
    60,
  );
  const g = prepareGeometry(cylinder),
    edges = geometryEdges(g);
  const rim = edges.findIndex((e) =>
    [e.a, e.b].every((i) => Math.abs(g.points[i][2] - 110) < 1e-4),
  );
  expect(rim).toBeGreaterThanOrEqual(0);
  const loop = edgeLoop(edges, rim, g.points);
  expect(curvedEdgeSelection(edges, rim, g.points).sort()).toEqual([...loop].sort());
  expect(loop.length).toBeGreaterThan(12);
  expect(loop.every((i) => Math.abs(g.points[i][2] - 110) < 1e-4)).toBe(true);
  const ids = g.points.flatMap((p, i) => (Math.abs(p[2] - 110) < 1e-4 ? [i] : []));
  const points = transformGeometryPoints(
    g.points,
    ids,
    geometryMatrix('scale', [1.5, 1.5, 1], [500, -300, 110]),
  );
  const mesh = commitGeometry(cylinder, points, true),
    before = importedMeshBody(mesh);
  const top = before.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
  expect(top).toBeDefined();
  expect(meshFaceSpan(mesh, top.ref).depth).toBeCloseTo(60, 4);
  const taller = pushPullMesh(mesh, top.ref, 20),
    after = importedMeshBody(taller);
  expect(taller.feature.height).toBeCloseTo(80, 4);
  expect(taller.feature.width).toBeCloseTo(mesh.feature.width, 4);
  expect(after.volume).toBeGreaterThan(before.volume);
  expect(meshClosure(after.vertices, after.triangles).closed).toBe(true);
  const restored = pushPullMesh(taller, top.ref, -20);
  expect(restored.feature.height).toBeCloseTo(60, 4);
  expect(importedMeshBody(restored).volume).toBeCloseTo(before.volume, 1);
  expect(() => pushPullMesh(taller, top.ref, -100)).toThrow();
  expect(() => pushPullMesh({ ...mesh, locked: true }, top.ref, 10)).toThrow('lukitus');
});
it('does not turn a straight box edge or sharp square outline into a full ring selection', () => {
  for (const height of [0, 50]) {
    const g = prepareGeometry(makeBody(100, 80, height));
    const edges = geometryEdges(g);
    expect(curvedEdgeSelection(edges, 0, g.points)).toHaveLength(2);
  }
});
it('rejects locked, collapsed and self intersecting edits without mutating the original', () => {
  const body = makeBody(100, 80, 60),
    g = prepareGeometry(body),
    snapshot = JSON.stringify(body);
  expect(() => prepareGeometry({ ...body, locked: true })).toThrow('lukitus');
  const collapsed = g.points.map((p) => [p[0], p[1], 0] as [number, number, number]);
  expect(() => commitGeometry(body, collapsed)).toThrow();
  const reversed = g.points.map((p) => [p[0], p[1], -p[2]] as [number, number, number]);
  expect(() => commitGeometry(body, reversed)).toThrow();
  const crossed = g.points.map((p) =>
    p[0] === 100 && p[2] === 60 ? ([-30, p[1], 60] as [number, number, number]) : p,
  );
  expect(() => validateGeometry(g, crossed)).toThrow();
  expect(JSON.stringify(body)).toBe(snapshot);
});
it('keeps mesh UV seams and closedness when moving shared vertices', () => {
  const body = makeBody(100, 80, 60),
    g = prepareGeometry(body);
  const mesh = geometryMeshBody(body, g, g.points);
  if (mesh.feature.type !== 'mesh') throw Error();
  mesh.feature.uv = mesh.feature.vertices.flatMap((_, i) => (i % 3 === 0 ? [0.2, 0.7] : []));
  const draft = prepareGeometry(mesh),
    points = transformGeometryPoints(
      draft.points,
      draft.points.flatMap((p, i) => (p[2] === 60 ? [i] : [])),
      geometryMatrix('move', [0, 0, 10], [0, 0, 0]),
    );
  const updated = commitGeometry(mesh, points);
  expect(updated.feature.type).toBe('mesh');
  if (updated.feature.type !== 'mesh') throw Error();
  expect(updated.feature.uv).toEqual(mesh.feature.uv);
  expect(updated.feature.solid).toBe(true);
  expect(updated.feature.height).toBe(70);
});
it('tapers a cylinder rim without flagging ordinary shared edges as self intersections', () => {
  const body = makeProfileBody(
    { kind: 'circle', radius: 30 },
    sketchFrame([0, 0, 0]),
    40,
    'Sylinteri',
    'model',
  );
  const g = prepareGeometry(body),
    ids = g.points.flatMap((p, i) => (p[2] > 39.999 ? [i] : []));
  const edges = geometryEdges(g),
    rim = edges.findIndex((e) => g.points[e.a][2] > 39.999 && g.points[e.b][2] > 39.999);
  expect(edgeLoop(edges, rim, g.points).length).toBe(ids.length);
  const points = transformGeometryPoints(
    g.points,
    ids,
    geometryMatrix('scale', [0.5, 0.5, 1], [0, 0, 40]),
  );
  const result = commitGeometry(body, points, true);
  expect(result.feature.type === 'mesh' && result.feature.solid).toBe(true);
});
it('rotates selected geometry in the part frame around an explicit anchor', () => {
  const body = rotateBodies([makeBody(100, 80, 60)], [0, 0, 0], [0, 0, 1], 30)[0];
  const g = prepareGeometry(body),
    pivot = g.points[0];
  const ids = g.points.map((_, i) => i);
  const matrix = geometryMatrix('rotate', [0, 0, 15], pivot, body.textureFrame?.rotation);
  const points = transformGeometryPoints(g.points, ids, matrix);
  expect(points[0]).toEqual(pivot);
  const result = commitGeometry(body, points);
  expect(shapeInfo(result).volume).toBeCloseTo(480000, 1);
});
it('preserves small mesh details far from the origin and updates automatic stock dimensions', () => {
  const body = makeBody(100, 80, 60),
    g = prepareGeometry(body);
  const mesh = geometryMeshBody(body, g, g.points);
  mesh.origin = [90000, -80000, 70000];
  if (mesh.feature.type !== 'mesh') throw Error();
  mesh.feature.vertices = mesh.feature.vertices.map((n, i) => (i % 3 === 2 ? n / 1000 : n));
  mesh.feature.height = 0.06;
  const draft = prepareGeometry(mesh);
  const points = transformGeometryPoints(
    draft.points,
    draft.points.flatMap((p, i) => (p[2] > 70000.03 ? [i] : [])),
    geometryMatrix('move', [0, 0, 0.013], [0, 0, 0]),
  );
  const changed = commitGeometry(mesh, points);
  expect(changed.feature.height).toBeCloseTo(0.073, 6);
  expect(changed.quantityBasis?.dimensions[2]).toBeCloseTo(0.073, 6);
});
it('keeps a deliberate face subdivision when its shared boundary is lowered', () => {
  const body = makeBody(100, 80, 20),
    info = shapeInfo(body);
  const top = info.mesh.faces.find((f) => f.normal[2] > 0.99)!;
  const inset = offsetFace(body, top.ref, 10).body;
  const g = prepareGeometry(inset);
  const ids = g.points.flatMap((p, i) =>
    p[2] === 20 && p[0] > 0 && p[0] < 100 && p[1] > 0 && p[1] < 80 ? [i] : [],
  );
  expect(ids.length).toBe(4);
  const changed = commitGeometry(
    inset,
    transformGeometryPoints(g.points, ids, geometryMatrix('move', [0, 0, -5], [0, 0, 0])),
  );
  const result = shapeInfo(changed);
  expect(result.volume).toBeLessThan(info.volume);
  expect(result.volume).toBeGreaterThan(100000);
  expect(result.mesh.faces.some((f) => f.normal[2] > 0.99)).toBe(true);
});

it('preserves an existing through-hole while changing its upper rim height', () => {
  const base = makeBody(100, 80, 20),
    cutter = makeBody(20, 20, 40, [40, 30, -10]);
  const body = booleanBodies([base], [cutter], 'cut')[0];
  const g = prepareGeometry(body),
    ids = g.points.flatMap((p, i) => (Math.abs(p[2] - 20) < 1e-5 ? [i] : []));
  const result = commitGeometry(
    body,
    transformGeometryPoints(g.points, ids, geometryMatrix('move', [0, 0, 5], [0, 0, 0])),
  );
  expect(shapeInfo(result).volume).toBeCloseTo(190000, 2);
  expect(result.feature.type === 'brep' && result.feature.solid).toBe(true);
});
it('rejects an unsupported multi-shell CAD body without dropping any of its solids', () => {
  const body = booleanBodies(
    [makeBody(100, 80, 60)],
    [makeBody(100, 80, 60, [200, 0, 0])],
    'join',
  )[0];
  const g = prepareGeometry(body),
    snapshot = JSON.stringify(body);
  const points = transformGeometryPoints(
    g.points,
    g.points.map((_, i) => i),
    geometryMatrix('move', [0, 0, 10], [0, 0, 0]),
  );
  expect(() => commitGeometry(body, points)).toThrow('CAD-os');
  expect(JSON.stringify(body)).toBe(snapshot);
  expect(shapeInfo(body).volume).toBeCloseTo(960000, 1);
});
it('uses exact CAD vertices, preserving sub-millimetre dimensions at a distant project origin', () => {
  const body = makeBody(100.123456, 80.654321, 0.123456, [90000, -80000, 70000]),
    g = prepareGeometry(body);
  const points = transformGeometryPoints(
    g.points,
    g.points.flatMap((p, i) => (p[2] > 70000.1 ? [i] : [])),
    geometryMatrix('move', [0, 0, 0.013], [0, 0, 0]),
  );
  const result = commitGeometry(body, points);
  expect(result.origin).toEqual(body.origin);
  expect(result.feature.width).toBeCloseTo(100.123456, 6);
  expect(result.feature.depth).toBeCloseTo(80.654321, 6);
  expect(result.feature.height).toBeCloseTo(0.136456, 6);
});

it('rejects inversion of a small disconnected mesh shell even when total volume stays positive', () => {
  const joined = booleanBodies(
    [makeBody(100, 80, 60)],
    [makeBody(20, 20, 20, [200, 0, 0])],
    'join',
  )[0];
  const g = prepareGeometry(joined),
    body = geometryMeshBody(joined, g, g.points),
    draft = prepareGeometry(body);
  const points = draft.points.map((p) =>
    p[0] > 150 ? ([p[0], p[1], 20 - p[2]] as [number, number, number]) : p,
  );
  expect(() => commitGeometry(body, points)).toThrow('kuoren nurin');
});
