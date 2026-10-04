import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createShape, meshBody, pushPullFace } from './kernel';
import { removeBoundary } from './operations';
import { penPath, splitWithPath, cutOpening } from './paths';
import { makeBody, makeProfileBody, freshProject, parseProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { rotateBodies } from './transforms';

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
function roundtrip(body: Body) {
  return parseProject(JSON.stringify({ ...freshProject(), bodies: [body] })).bodies[0];
}

it('persists open paths and splits an edge-to-edge line into independently editable floor faces', () => {
  const floor = makeBody(600, 400, 100, [0, 0, -100]);
  const line = roundtrip(
    penPath(
      [
        [200, 0, 0],
        [200, 400, 0],
      ],
      'Raja',
    ),
  );
  expect(mesh(line).faces).toHaveLength(0);
  expect(mesh(line).edgesCAD).toHaveLength(1);
  const result = splitWithPath(floor, 'z:max', line);
  expect(result.unchanged).toBeUndefined();
  const saved = roundtrip(result.body),
    m = mesh(saved);
  expect(m.faces).toHaveLength(7);
  expect(m.volume).toBeCloseTo(24000000, 3);
  const cap = m.faces.find((f) => f.normal[2] > 0.99 && f.center[0] < 200)!;
  expect(mesh(pushPullFace(saved, cap.ref, 50)).volume).toBeCloseTo(28000000, 3);
  expect(mesh(removeBoundary(saved, m.boundaries[0].faces)).faces).toHaveLength(6);
});

it('keeps dangling paths separate and supports bent and rotated face divisions', () => {
  const box = makeBody(600, 400, 100);
  const dangling = penPath(
    [
      [100, 100, 100],
      [200, 200, 100],
    ],
    'Viiva',
  );
  expect(splitWithPath(box, 'z:max', dangling).unchanged).toBe(true);
  const line = penPath(
    [
      [200, 0, 100],
      [200, 200, 100],
      [300, 400, 100],
    ],
    'Raja',
  );
  const [part, path] = rotateBodies([box, line], [0, 0, 0], [1, 1, 0], 27);
  const top = mesh(part).faces.find((f) => f.normal[2] > 0.8)!;
  const result = splitWithPath(part, top.ref, path);
  expect(mesh(result.body).faces).toHaveLength(7);
  expect(mesh(result.body).volume).toBeCloseTo(mesh(box).volume, 3);
});

it('cuts a door through multiple wall layers while preserving unrelated parts and exact profiles', () => {
  const front = makeBody(1000, 18, 2400),
    back = makeBody(1000, 100, 2400, [0, 80, 0]),
    side = makeBody(100, 100, 100, [1500, 0, 0]);
  const profile = makeProfileBody(
    { kind: 'rectangle', width: 600, depth: 2000 },
    sketchFrame([200, 0, 0], [0, -1, 0]),
  );
  const result = cutOpening(profile, [front, back, side]);
  expect(result.affected).toEqual([front.id, back.id]);
  expect(result.bodies[2]).toBe(side);
  expect(mesh(result.bodies[0]).volume).toBeCloseTo((1000 * 2400 - 600 * 2000) * 18, 2);
  expect(mesh(result.bodies[1]).volume).toBeCloseTo((1000 * 2400 - 600 * 2000) * 100, 2);
  expect(() => cutOpening(profile, [{ ...front, locked: true }])).toThrow('Hold');
});

it('cuts round and pen openings on rotated planes and can remove a fully covered part', () => {
  const part = makeBody(400, 300, 80);
  const circle = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([120, 100, 80]));
  const [rotated, profile] = rotateBodies([part, circle], [0, 0, 0], [1, 1, 0], 37);
  expect(mesh(cutOpening(profile, [rotated]).bodies[0]).volume).toBeCloseTo(
    400 * 300 * 80 - Math.PI * 40 ** 2 * 80,
    2,
  );
  const polygon = makeProfileBody(
    {
      kind: 'polygon',
      points: [
        [0, 0],
        [400, 0],
        [400, 300],
        [0, 300],
      ],
    },
    sketchFrame([0, 0, 80]),
  );
  expect(cutOpening(polygon, [part])).toEqual({ bodies: [], affected: [part.id] });
  expect(() =>
    cutOpening(
      penPath(
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        'Viiva',
      ),
      [part],
    ),
  ).toThrow('suljetun');
});
