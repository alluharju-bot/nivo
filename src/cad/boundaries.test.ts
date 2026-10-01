import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createShape, meshBody, pushPullFace } from './kernel';
import { splitFace, offsetFace, removeBoundary } from './operations';
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

it('erases a saved rectangular inset without history and preserves metadata, bounds and volume', () => {
  const original = { ...makeBody(600, 600, 2400), name: 'Kaappi', color: '#123456' };
  const inset = roundtrip(offsetFace(original, 'y:min', 18).body);
  const before = mesh(inset);
  expect(before.boundaries).toHaveLength(1);
  expect(before.boundaries[0].lines.length).toBeGreaterThan(0);
  const fixed = roundtrip(removeBoundary(inset, before.boundaries[0].faces));
  const after = mesh(fixed);
  expect(after.faces).toHaveLength(6);
  expect(after.boundaries).toHaveLength(0);
  expect(after.volume).toBeCloseTo(before.volume, 2);
  expect(fixed.origin).toEqual(original.origin);
  expect(fixed.feature).toMatchObject({ width: 600, depth: 600, height: 2400 });
  expect(fixed).toMatchObject({ id: original.id, name: original.name, color: original.color });
  expect(mesh(inset).faces).toHaveLength(7);
});

it('merges only the hovered region and leaves a separate curved division editable', () => {
  const plate = makeBody(300, 200, 20);
  const first = splitFace(
    plate,
    'z:max',
    makeProfileBody({ kind: 'rectangle', width: 50, depth: 60 }, sketchFrame([20, 20, 20])),
  );
  const top = mesh(first.body).faces.find((f) => f.normal[2] > 0.99 && f.ref !== first.face)!;
  const second = splitFace(
    first.body,
    top.ref,
    makeProfileBody({ kind: 'circle', radius: 25 }, sketchFrame([220, 100, 20])),
  );
  const saved = roundtrip(second.body),
    before = mesh(saved);
  expect(before.boundaries).toHaveLength(2);
  const rectangle = before.boundaries.find((b) => b.lines.every((n, i) => i % 3 !== 0 || n < 100))!;
  const fixed = removeBoundary(saved, rectangle.faces),
    after = mesh(fixed);
  expect(after.faces).toHaveLength(before.faces.length - 1);
  expect(after.boundaries).toHaveLength(1);
  expect(after.boundaries[0].lines.length).toBeGreaterThan(24);
  const cap = after.faces.find((f) => f.normal[2] > 0.99 && Math.abs(f.center[0] - 220) < 1e-5)!;
  expect(mesh(pushPullFace(fixed, cap.ref, -10)).volume).toBeCloseTo(
    before.volume - Math.PI * 25 ** 2 * 10,
    3,
  );
  expect(
    mesh(removeBoundary(roundtrip(fixed), mesh(roundtrip(fixed)).boundaries[0].faces)).faces,
  ).toHaveLength(6);
});

it('supports rotated and zero-thickness divided faces', () => {
  for (const height of [0, 18]) {
    const split = splitFace(
      makeBody(100, 80, height),
      'z:max',
      makeProfileBody({ kind: 'rectangle', width: 30, depth: 20 }, sketchFrame([10, 10, height])),
    );
    const rotated = rotateBodies([split.body], [0, 0, 0], [1, 1, 0], 35)[0];
    const before = mesh(rotated);
    const result = mesh(removeBoundary(roundtrip(rotated), before.boundaries[0].faces));
    expect(result.boundaries).toHaveLength(0);
    expect(result.faces.length).toBe(before.faces.length - 1);
    expect(result.volume).toBeCloseTo(before.volume, 4);
  }
});

it('rejects structural edges, holes, held parts and stale face pairs atomically', () => {
  const box = makeBody(100, 100, 20);
  expect(mesh(box).boundaries).toHaveLength(0);
  expect(() => removeBoundary(box, ['z:max', 'y:min'])).toThrow('samantasoisen');
  const inset = offsetFace(box, 'z:max', 10);
  const pair = mesh(inset.body).boundaries[0].faces;
  expect(() => removeBoundary({ ...inset.body, locked: true }, pair)).toThrow('kiinnitetty');
  for (const depth of [-10, -20]) {
    const changed = pushPullFace(inset.body, inset.face, depth);
    expect(mesh(changed).boundaries).toHaveLength(0);
    expect(() => removeBoundary(changed, pair)).toThrow();
  }
  expect(mesh(box).volume).toBeCloseTo(200000, 5);
});

it('repairs a rectangle on a hollow cabinet underside while preserving the cavity', () => {
  const inset = offsetFace(makeBody(600, 600, 2400), 'y:min', 18);
  const cabinet = pushPullFace(inset.body, inset.face, -582);
  const before = mesh(cabinet);
  const bottom = before.faces.find(
    (f) => f.planar && f.normal[2] < -0.99 && Math.abs(f.center[2]) < 1e-5,
  )!;
  const split = splitFace(
    cabinet,
    bottom.ref,
    makeProfileBody(
      { kind: 'rectangle', width: 500, depth: 30 },
      sketchFrame([40, 100, 0], [0, 0, -1]),
    ),
  );
  const saved = roundtrip(split.body);
  const repaired = mesh(removeBoundary(saved, mesh(saved).boundaries[0].faces));
  expect(repaired.volume).toBeCloseTo(before.volume, 2);
  expect(repaired.faces).toHaveLength(before.faces.length);
  expect(repaired.boundaries).toHaveLength(0);
});
