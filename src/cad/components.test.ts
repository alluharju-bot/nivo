import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import { asComponent, synchronizeComponents } from '../model/components';
import { freshProject, makeBody } from '../model/project';
import { add } from '../model/geometry';
import { instantiateComponents } from './components';
import { rotateBodies } from './transforms';
import { createShape, pushPullFace, meshBody, bodyFromShape } from './kernel';
import { knifeBodies } from './modeling';
import { linkSplitCopies } from '../model/linkedSplit';
import { applySplitResult } from '../model/splitReferences';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
it('knife repeats its pieces in a rotated linked copy, preserves piece links and rejects a held copy', async () => {
  const a = asComponent(makeBody(600, 400, 100));
  const b = rotateBodies(
    [{ ...a, id: 'copy', origin: [1000, 0, 0] }],
    [1000, 0, 0],
    [0, 0, 1],
    90,
  )[0];
  const before = { ...freshProject(), bodies: [a, b] };
  const split = knifeBodies(
    [a],
    [
      { origin: [200, -80, 500], direction: [0, 0, -1] },
      { origin: [200, 480, 500], direction: [0, 0, -1] },
    ],
  );
  const result = await linkSplitCopies(before, split, async (s, t) => instantiateComponents(s, t));
  const after = applySplitResult(before, result);
  expect(after.bodies).toHaveLength(4);
  expect(result.replacements[a.id]).toHaveLength(2);
  expect(result.replacements[b.id]).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    const source = after.bodies.find((p) => p.id === result.replacements[a.id][i])!;
    const copy = after.bodies.find((p) => p.id === result.replacements[b.id][i])!;
    expect(source.component!.id).toBe(copy.component!.id);
    expect(source.component!.id).not.toBe(a.component!.id);
    add(copy.origin, copy.component!.offset).forEach((n, axis) =>
      expect(n).toBeCloseTo(add(b.origin, b.component!.offset)[axis], 5),
    );
    const sourceShape = createShape(source),
      copyShape = createShape(copy);
    expect(measureVolume(copyShape.asShape3D())).toBeCloseTo(
      measureVolume(sourceShape.asShape3D()),
      2,
    );
    sourceShape.delete();
    copyShape.delete();
  }
  await expect(
    linkSplitCopies({ ...before, bodies: [a, { ...b, locked: true }] }, split, async (s, t) =>
      instantiateComponents(s, t),
    ),
  ).rejects.toThrow('Hold');
  expect(before.bodies).toEqual([a, b]);
});
it('propagates opposite-face push/pull in each rotated instance frame without shifting the fixed end', async () => {
  const a = asComponent(makeBody(600, 400, 18));
  const b = rotateBodies(
    [{ ...a, id: 'rotated-copy', origin: [1000, 0, 0] }],
    [1000, 0, 0],
    [0, 0, 1],
    90,
  )[0];
  const before = { ...freshProject(), bodies: [a, b] };
  const edited = pushPullFace(a, 'x:min', -50);
  const after = await synchronizeComponents(
    before,
    { ...before, bodies: [edited, b] },
    async (s, t) => instantiateComponents(s, t),
  );
  const updated = after.bodies[1];
  expect(updated.origin[0]).toBeCloseTo(600, 4);
  expect(updated.origin[1]).toBeCloseTo(50, 4);
  expect(updated.feature.width).toBeCloseTo(400, 4);
  expect(updated.feature.depth).toBeCloseTo(550, 4);
  expect(add(updated.origin, updated.component!.offset)).toEqual(
    add(b.origin, b.component!.offset),
  );
  const shape = createShape(updated);
  expect(measureVolume(shape.asShape3D())).toBeCloseTo(550 * 400 * 18, 2);
  shape.delete();
  // Rotating an instance is a placement change and must never rotate its siblings.
  const rotated = rotateBodies([edited], [0, 0, 0], [1, 2, 3], 37)[0];
  const placed = await synchronizeComponents(
    after,
    { ...after, bodies: [rotated, updated] },
    async (s, t) => instantiateComponents(s, t),
  );
  expect(placed.bodies[1]).toEqual(updated);
});
it('propagates edits made on a rotated instance back to an unrotated sibling', () => {
  const a = asComponent(makeBody(200, 300, 20));
  const b = rotateBodies(
    [{ ...a, id: 'copy', origin: [1000, 0, 0] }],
    [1000, 0, 0],
    [0, 0, 1],
    90,
  )[0];
  const shape = createShape(b);
  const face = meshBody(b, shape).faces.find((f) => f.normal[1] > 0.999)!;
  shape.delete();
  const edited = pushPullFace(b, face.ref, 30);
  const updated = instantiateComponents(edited, [a])[0];
  expect(updated.origin[0]).toBeCloseTo(0, 4);
  expect(updated.origin[1]).toBeCloseTo(0, 4);
  expect(updated.feature.width).toBeCloseTo(230, 4);
  expect(updated.feature.depth).toBeCloseTo(300, 4);
});

it('propagates a hollow BRep through an arbitrary rotated instance without changing its frame', () => {
  const source = asComponent(makeBody(600, 600, 720));
  const copy = rotateBodies(
    [{ ...source, id: 'angled', origin: [1500, 200, 30] }],
    [1500, 200, 30],
    [1, 2, 3],
    37,
  )[0];
  const outer = createShape(source),
    inner = createShape(makeBody(564, 600, 684, [18, -18, 18]));
  const hollow = outer.asShape3D().cut(inner.asShape3D());
  try {
    const edited = bodyFromShape(source, hollow);
    const updated = instantiateComponents(edited, [copy])[0];
    const shape = createShape(updated);
    try {
      expect(measureVolume(shape.asShape3D())).toBeCloseTo(measureVolume(hollow.asShape3D()), 1);
      add(updated.origin, updated.component!.offset).forEach((n, i) =>
        expect(n).toBeCloseTo(add(copy.origin, copy.component!.offset)[i], 5),
      );
      expect(updated.component!.rotation).toEqual(copy.component!.rotation);
    } finally {
      shape.delete();
    }
  } finally {
    hollow.delete();
    inner.delete();
    outer.delete();
  }
});
