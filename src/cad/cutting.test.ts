import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody } from '../model/project';
import { rectangularCutSize } from '../model/cutting';
import { rotateBodies } from './transforms';
import { bodyFromShape, createShape, meshBody } from './kernel';
import { detailEdges } from './details';
import { sketchFrame } from '../model/sketch';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

it('measures actual panel dimensions after repeated arbitrary CAD rotations, independent of world bounds', () => {
  const source = makeBody(18, 563.125, 2400.375, [235.5, -128, 30]);
  let body = rotateBodies([source], [13, 77, -8], [1, 2, 3], 37)[0];
  body = rotateBodies([body], [0, 0, 0], [-2, 1, 0], -61)[0];
  const shape = createShape(body);
  try {
    expect([body.feature.width, body.feature.depth, body.feature.height]).not.toEqual([
      18, 563.125, 2400.375,
    ]);
    expect(rectangularCutSize(body, meshBody(body, shape))).toEqual([2400.375, 563.125, 18]);
  } finally {
    shape.delete();
  }
});

it('recognises drawn face-oriented rectangles but never reports a hollow cabinet or fillet as a complete panel', () => {
  const body = makeProfileBody(
    { kind: 'rectangle', width: 800, depth: 500 },
    sketchFrame([200, 100, 50], [1, 2, 3]),
    18,
  );
  const shape = createShape(body);
  try {
    expect(rectangularCutSize(body, meshBody(body, shape))).toEqual([800, 500, 18]);
  } finally {
    shape.delete();
  }
  const box = makeBody(600, 600, 720),
    outer = createShape(box),
    inner = createShape(makeBody(564, 600, 684, [18, -18, 18]));
  const hollow = outer.asShape3D().cut(inner.asShape3D());
  try {
    const cabinet = bodyFromShape(box, hollow);
    expect(rectangularCutSize(cabinet, meshBody(cabinet, hollow))).toBeUndefined();
  } finally {
    hollow.delete();
    outer.delete();
    inner.delete();
  }
  const rounded = detailEdges(makeBody(600, 400, 18), [0], 'fillet', 2);
  expect(rectangularCutSize(rounded.body, rounded.mesh)).toBeUndefined();
});
