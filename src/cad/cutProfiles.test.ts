import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, getOC, type AnyShape } from 'replicad';
import { freshProject, makeProfileBody, parseProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import {
  bodyFromShape,
  createShape,
  meshBody,
  pushPullFace,
  shapeIsValid,
  solidVolume,
} from './kernel';
import { booleanBodies, splitFace } from './operations';
import { detailEdges } from './details';
import { rotateBodies } from './transforms';
import { scaleBodies } from './scaling';
import { asComponent } from '../model/components';
import { instantiateComponents } from './components';
import { add, scale } from '../model/geometry';

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
const circle = (radius: number, x: number, z: number, distance = 0) =>
  makeProfileBody({ kind: 'circle', radius }, sketchFrame([x, 0, z]), distance);
function inspect(body: Body) {
  const s = createShape(body);
  try {
    expect(shapeIsValid(s)).toBe(true);
    return meshBody(body, s);
  } finally {
    s.delete();
  }
}
function setup() {
  const original = booleanBodies([circle(10, 0, 20, -20)], [circle(3, 0, 20, -4)], 'cut')[0];
  const edges = inspect(original)
    .detailEdges!.filter((e) => {
      const p = e.lines;
      return (
        p.length > 6 &&
        p.every((n, i) => (i % 3 === 2 ? Math.abs(n - 20) < 1e-5 : Math.abs(n) < 3.01))
      );
    })
    .map((e) => e.index);
  expect(edges).toHaveLength(1);
  const body = detailEdges(original, edges, 'fillet', 0.8).body;
  const face = inspect(body).faces.find(
    (f) => f.planar && f.normal[2] > 0.99 && Math.abs(f.center[2] - 20) < 1e-5,
  )!;
  const profile = circle(3, 3.5, 20);
  return { body, profile, split: splitFace(body, face.ref, profile) };
}
function equivalent(actual: Body, expected: Body) {
  const a = createShape(actual),
    b = createShape(expected),
    common = a.asShape3D().intersect(b);
  const volume = (s: AnyShape) => {
    const oc = getOC(),
      props = new oc.GProp_GProps();
    try {
      oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, true, true, false, false, false);
      return props.Mass();
    } finally {
      props.delete();
    }
  };
  try {
    expect(shapeIsValid(a)).toBe(true);
    expect(Math.abs(volume(a) - volume(b))).toBeLessThan(Math.max(1e-6, volume(b) * 1e-7));
    expect(Math.abs(volume(common) - volume(b))).toBeLessThan(Math.max(1e-6, volume(b) * 1e-7));
  } finally {
    common.delete();
    a.delete();
    b.delete();
  }
}
it('cuts the entire circle across a rounded blind pocket, including after save/reload', () => {
  const { body, split } = setup();
  const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [split.body] })).bodies[0];
  expect(saved.feature.type === 'brep' && saved.feature.cutProfiles?.length).toBe(1);
  const result = pushPullFace(saved, split.face, -20);
  const expected = booleanBodies([body], [circle(3, 3.5, 20, -20)], 'cut')[0];
  equivalent(result, expected);
  expect(result.feature.type === 'brep' && result.feature.cutProfiles).toBeUndefined();
});
it('extends only the material face outward and keeps an unrelated split available', () => {
  const { body, split } = setup();
  const source = createShape(split.body),
    rebuilt = bodyFromShape(split.body, source);
  source.delete();
  expect(rebuilt.feature.type === 'brep' && rebuilt.feature.cutProfiles?.length).toBe(1);
  const result = pushPullFace(rebuilt, split.face, 2);
  expect(inspect(result).volume).toBeGreaterThan(inspect(body).volume);
  // Outward creates no material below the previous top, even over the old recess.
  const r = createShape(result),
    b = createShape(body),
    overlap = r.asShape3D().intersect(b);
  try {
    expect(solidVolume(overlap)).toBeCloseTo(solidVolume(b), 4);
  } finally {
    r.delete();
    b.delete();
    overlap.delete();
  }
});
it('detaches a full cutter when its selected surface is deliberately subdivided', () => {
  const { body, split } = setup();
  const small = circle(0.4, 5.5, 20);
  const divided = splitFace(split.body, split.face, small);
  const result = pushPullFace(divided.body, divided.face, -20);
  const expected = booleanBodies([body], [circle(0.4, 5.5, 20, -20)], 'cut')[0];
  equivalent(result, expected);
});
it('keeps the complete cutter in a moved, rotated, linked occurrence', () => {
  const { body, split } = setup();
  const linked = asComponent(split.body);
  const moved = { ...linked, origin: add(linked.origin, [60, 30, -10]) };
  const rotated = rotateBodies([moved], [0, 0, 0], [1, 2, 3], 37)[0];
  const copy = instantiateComponents(linked, [rotated])[0];
  const face = inspect(copy).faces[Number(split.face.split(':')[1])];
  const result = pushPullFace(copy, face.ref, -20);
  const expected = booleanBodies([body], [circle(3, 3.5, 20, -20)], 'cut')[0];
  equivalent(
    result,
    rotateBodies(
      [{ ...expected, origin: add(expected.origin, [60, 30, -10]) }],
      [0, 0, 0],
      [1, 2, 3],
      37,
    )[0],
  );
});
it.each([
  [2, 2, 2],
  [1.5, 0.8, 1],
] as [number, number, number][])(
  'preserves the cut footprint after scaling %s',
  async (x, y, z) => {
    const { body, split } = setup();
    const factors: [number, number, number] = [x, y, z];
    const [scaled] = await scaleBodies([split.body], [0, 0, 0], factors);
    const selected = inspect(scaled).faces.find(
      (f) =>
        f.planar &&
        f.normal[2] > 0.99 &&
        f.center[0] > 2 * x &&
        Math.abs(f.center[2] - 20 * z) < 1e-5,
    )!;
    const result = pushPullFace(scaled, selected.ref, -20 * z);
    const expected = booleanBodies([body], [circle(3, 3.5, 20, -20)], 'cut')[0];
    equivalent(result, (await scaleBodies([expected], [0, 0, 0], factors))[0]);
  },
  30000,
);
