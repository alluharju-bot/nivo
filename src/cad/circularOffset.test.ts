import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { getOC, setOC, measureArea, type Shape3D } from 'replicad';
import { makeProfileBody, type Body, type Vec3 } from '../model/project';
import { sketchFrame, type Profile } from '../model/sketch';
import { createShape, meshBody, pushPullFace } from './kernel';
import { offsetFace, offsetOutline, booleanBodies } from './operations';
import { scaleBodies } from './scaling';
import { rotateBodies } from './transforms';
import { CadBuildCache } from './buildCache';

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

function inspect(body: Body) {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
}

for (const distance of [5, -5])
  it(`repeats a circular offset on its new region (${distance} mm)`, () => {
    let body = makeProfileBody({ kind: 'circle', radius: 50 }, sketchFrame([0, 0, 0]));
    let face = inspect(body).faces[0].ref;
    for (let step = 1; step <= 3; step++) {
      expect(offsetOutline(body, face, distance).length).toBeGreaterThan(0);
      const result = offsetFace(body, face, distance);
      body = result.body;
      face = result.face;
      expect(inspect(body).faces).toHaveLength(step + 1);
      const shape = createShape(body);
      try {
        expect(measureArea(shape as Shape3D)).toBeCloseTo(
          Math.PI * (distance < 0 ? 50 + step * 5 : 50) ** 2,
          4,
        );
      } finally {
        shape.delete();
      }
    }
  });

it('insets a previously created circular rim without losing its centre or other divisions', () => {
  const disk = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
  let body = offsetFace(disk, inspect(disk).faces[0].ref, 20).body;
  const shape = createShape(body),
    faces = shape.faces;
  let face;
  try {
    face = inspect(body).faces.find(
      (f) => Math.abs(measureArea(faces[f.index]) - Math.PI * (100 ** 2 - 80 ** 2)) < 1e-4,
    )!.ref;
  } finally {
    faces.forEach((f) => f.delete());
    shape.delete();
  }
  for (let i = 0; i < 3; i++) {
    expect(offsetOutline(body, face, 2).length).toBeGreaterThan(0);
    const inset = offsetFace(body, face, 2);
    body = inset.body;
    face = inset.face;
    expect(inspect(body).faces).toHaveLength(4 + 2 * i);
  }
});

for (const sides of [18, 24, 60])
  it(`repeats an inset on a ${sides}-sided cylinder cap`, () => {
    const profile: Profile = {
      kind: 'polygon',
      points: Array.from({ length: sides }, (_, i) => [
        50 * Math.cos((i * 2 * Math.PI) / sides),
        50 * Math.sin((i * 2 * Math.PI) / sides),
      ]),
    };
    let body = makeProfileBody(profile, sketchFrame([0, 0, 0]), 40);
    let face = inspect(body).faces.find((f) => f.normal[2] > 0.9)!.ref;
    const volume = inspect(body).volume;
    for (const distance of [5, 4, 3]) {
      const result = offsetFace(body, face, distance);
      body = result.body;
      face = result.face;
      expect(inspect(body).volume).toBeCloseTo(volume, 3);
    }
    expect(inspect(body).faces).toHaveLength(sides + 5);
  });

// Fixed-order volume integration is too coarse for rational B-spline cylinders.
function exactVolume(body: Body) {
  const shape = createShape(body),
    oc = getOC(),
    props = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumePropertiesGK(shape.wrapped, props, 1e-9, true, true, false, false, false);
    return props.Mass();
  } finally {
    props.delete();
    shape.delete();
  }
}

it('scales a cylinder around its centre with a populated viewport cache', async () => {
  const body = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 300);
  const cache = new CadBuildCache();
  try {
    cache.build([body]);
    const [scaled] = await scaleBodies([body], [0, 0, 150], [0.8, 0.8, 1], cache);
    cache.build([scaled]);
    expect(exactVolume(scaled)).toBeCloseTo(Math.PI * 160 ** 2 * 300, 3);
    for (const face of inspect(scaled).faces.filter((f) => f.planar)) {
      expect(offsetOutline(scaled, face.ref, 8, cache).length).toBeGreaterThan(0);
      const inset = offsetFace(scaled, face.ref, 8, cache);
      expect(exactVolume(pushPullFace(inset.body, inset.face, -350))).toBeCloseTo(
        Math.PI * (160 ** 2 - 152 ** 2) * 300,
        2,
      );
    }
  } finally {
    cache.dispose();
  }
}, 30000);

it('rejects offsets that collapse or pass through the circle centre', () => {
  const disk = makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([0, 0, 0]));
  const face = inspect(disk).faces[0].ref;
  expect(offsetOutline(disk, face, 9.9).length).toBeGreaterThan(0);
  for (const distance of [10, 10.1, 15, 25]) {
    expect(() => offsetOutline(disk, face, distance)).toThrow();
    expect(() => offsetFace(disk, face, distance)).toThrow();
  }
});

for (const normal of [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0.6, 0.8],
] as Vec3[])
  for (const depth of [600, -600])
    it(`insets both cylinder caps normal=${normal} depth=${depth}`, () => {
      const body = makeProfileBody(
        { kind: 'circle', radius: 200 },
        sketchFrame([350, -230, 40], normal),
        depth,
      );
      const mesh = inspect(body);
      const caps = mesh.faces.filter((f) => f.planar);
      expect(caps).toHaveLength(2);
      for (const face of caps) {
        expect(offsetOutline(body, face.ref, 8).length).toBeGreaterThan(0);
        const inset = offsetFace(body, face.ref, 8);
        expect(inspect(inset.body).volume).toBeCloseTo(mesh.volume, 3);
        const hole = pushPullFace(inset.body, inset.face, -650);
        expect(inspect(hole).volume).toBeCloseTo(Math.PI * (200 ** 2 - 192 ** 2) * 600, 3);
      }
    });

it('insets the annular caps of an open cylinder', () => {
  const outer = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 600);
  const inner = makeProfileBody({ kind: 'circle', radius: 180 }, sketchFrame([0, 0, -10]), 620);
  const body = booleanBodies([outer], [inner], 'cut')[0];
  for (const face of inspect(body).faces.filter((f) => f.planar)) {
    const result = offsetFace(body, face.ref, 5);
    const pocket = pushPullFace(result.body, result.face, -10);
    expect(inspect(pocket).volume).toBeCloseTo(
      Math.PI * (200 ** 2 - 180 ** 2) * 600 - Math.PI * (195 ** 2 - 185 ** 2) * 10,
      3,
    );
  }
});

for (const factors of [
  [0.8, 0.8, 0.8],
  [0.8, 0.8, 1],
  [0.8, 1.2, 1],
] as Vec3[])
  it(`insets a scaled then rotated cylinder ${factors}`, async () => {
    const raw = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([350, -230, 40]), 600);
    const [scaled] = await scaleBodies([raw], [0, 0, 0], factors);
    const [body] = rotateBodies([scaled], [0, 0, 0], [1, 0, 0], 22.5);
    const before = inspect(body);
    for (const face of before.faces.filter((f) => f.planar)) {
      expect(offsetOutline(body, face.ref, 8).length).toBeGreaterThan(0);
      const inset = offsetFace(body, face.ref, 8);
      expect(inspect(inset.body).volume).toBeCloseTo(before.volume, 3);
    }
  });

for (const normal of [
  [0, 0, 1],
  [0, 0, -1],
  [0, 0.6, 0.8],
] as Vec3[])
  for (const depth of [600, -600])
    it(`insets a circle raised with push/pull normal=${normal} depth=${depth}`, () => {
      const disk = makeProfileBody(
        { kind: 'circle', radius: 200 },
        sketchFrame([350, -230, 40], normal),
      );
      const body = pushPullFace(disk, inspect(disk).faces[0].ref, depth);
      const mesh = inspect(body);
      for (const face of mesh.faces.filter((f) => f.planar)) {
        expect(offsetOutline(body, face.ref, 8).length).toBeGreaterThan(0);
        const inset = offsetFace(body, face.ref, 8);
        expect(inspect(inset.body).volume).toBeCloseTo(mesh.volume, 3);
        expect(inspect(pushPullFace(inset.body, inset.face, -650)).volume).toBeCloseTo(
          Math.PI * (200 ** 2 - 192 ** 2) * 600,
          3,
        );
      }
    });
