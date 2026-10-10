import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeCylinder, makeBox, measureVolume } from 'replicad';
import { makeBody, freshProject, bounds, parseProject } from '../model/project';
import { asComponent, synchronizeComponents } from '../model/components';
import { prepareScaling, applyScaling, type Scaling } from '../model/scaling';
import { instantiateComponents } from './components';
import { scaleBodies } from './scaling';
import { createShape, bodyFromShape, shapeIsValid, meshBody, pushPullFace } from './kernel';
import { offsetFace } from './operations';
import { rotateBodies } from './transforms';
import { resolveAnchor } from '../model/guides';

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

describe('exact CAD scaling', () => {
  it('scales a perforated, rounded solid uniformly and along one axis without tessellating its topology', async () => {
    const box = makeBox([0, 0, 0], [80, 60, 20]).fillet(3);
    const cylinder = makeCylinder(6, 40, [40, 30, -10]);
    const shape = box.cut(cylinder);
    try {
      const body = bodyFromShape(makeBody(80, 60, 20), shape, []);
      const volume = measureVolume(shape);
      for (const factors of [
        [2, 2, 2],
        [2, 1, 1],
      ] as [number, number, number][]) {
        const [scaled] = await scaleBodies([body], [0, 0, 0], factors);
        const exact = createShape(
          parseProject(JSON.stringify({ ...freshProject(), bodies: [scaled] })).bodies[0],
        );
        try {
          expect(shapeIsValid(exact)).toBe(true);
          expect(meshBody(scaled, exact).faces.filter((f) => f.planar)).toHaveLength(6);
          expect(measureVolume(exact.asShape3D()) / volume).toBeCloseTo(
            factors[0] * factors[1] * factors[2],
            3,
          );
          const b = bounds([scaled]);
          expect(b.max[0]).toBeCloseTo(160, 4);
          expect(b.max[1]).toBeCloseTo(60 * factors[1], 4);
          expect(exact.faces.length).toBeLessThan(60);
          // A tool through the pre-existing hole must remove no material.
          const probe = makeCylinder(4, 50, [80, 30 * factors[1], -5]);
          const cut = (exact as typeof shape).cut(probe);
          expect(measureVolume(cut)).toBeCloseTo(measureVolume(exact.asShape3D()), 3);
          cut.delete();
          probe.delete();
        } finally {
          exact.delete();
        }
      }
    } finally {
      shape.delete();
      cylinder.delete();
      box.delete();
    }
  }, 30000);
  it('retains original vertex anchors at the transformed locations', async () => {
    const body = makeBody(20, 30, 40, [10, 20, 30]),
      shape = createShape(body);
    const anchors = meshBody(body, shape).verticesCAD;
    shape.delete();
    const [scaled] = await scaleBodies([body], [10, 20, 30], [2, 1, 1]);
    for (const v of anchors)
      expect(resolveAnchor([scaled], v.anchor)).toEqual(
        v.point.map((n, i) => (i === 0 ? 10 + 2 * (n - 10) : n)),
      );
  });
  it('scales planar geometry without inventing thickness', async () => {
    const body = makeBody(100, 50, 0, [40, 30, 5]);
    const [scaled] = await scaleBodies([body], [40, 30, 5], [2, 1, 1]);
    const b = bounds([scaled]);
    b.min.forEach((n, i) => expect(n).toBeCloseTo([40, 30, 5][i], 5));
    b.max.forEach((n, i) => expect(n).toBeCloseTo([240, 80, 5][i], 5));
    const shape = createShape(scaled);
    expect(shapeIsValid(shape)).toBe(true);
    shape.delete();
  });
  it('keeps flat faces editable by offset and push/pull after stretching, and retains edge anchors', async () => {
    const body = makeBody(100, 80, 20),
      original = createShape(body),
      oldMesh = meshBody(body, original);
    original.delete();
    const [scaled] = await scaleBodies([body], [0, 0, 0], [2, 1, 1]);
    const shape = createShape(scaled),
      mesh = meshBody(scaled, shape);
    shape.delete();
    expect(mesh.faces.every((f) => f.planar)).toBe(true);
    const edge = oldMesh.edgesCAD[0];
    const resolved = resolveAnchor([scaled], { edge: { from: edge.from, to: edge.to, t: 0.5 } });
    expect(resolved).toBeDefined();
    expect(resolved![0]).toBeCloseTo(edge.start[0] + edge.end[0], 5);
    const top = mesh.faces.find((f) => f.normal[2] > 0.9)!;
    const inset = offsetFace(scaled, top.ref, 5);
    const raised = pushPullFace(inset.body, inset.face, 10);
    expect(bounds([raised]).max[2]).toBeCloseTo(30, 4);
    const final = createShape(raised);
    expect(shapeIsValid(final)).toBe(true);
    final.delete();
  });
  it('rejects zero, negative, non-finite, excessive factors and held objects', async () => {
    const body = makeBody(20, 30, 40);
    for (const factor of [0, -1, NaN, Infinity, 1001])
      await expect(scaleBodies([body], [0, 0, 0], [factor, 1, 1])).rejects.toThrow();
    await expect(scaleBodies([{ ...body, locked: true }], [0, 0, 0], [2, 2, 2])).rejects.toThrow(
      /kiinnitetty/,
    );
  });
});
describe('selection and linked definitions', () => {
  async function apply(bodies: ReturnType<typeof makeBody>[], s: Scaling) {
    const before = { ...freshProject(), bodies };
    const base = prepareScaling(before, s);
    const after = applyScaling(
      base.project,
      await scaleBodies(base.sources, s.pivot, s.factors),
      s,
    );
    return synchronizeComponents(before, after, async (source, targets) =>
      instantiateComponents(source, targets),
    );
  }
  it('scales one definition once and scales selected spacing while leaving unselected instance placement fixed', async () => {
    const a = asComponent(makeBody(20, 30, 40)),
      b = { ...asComponent(makeBody(20, 30, 40, [100, 0, 0]), a.component!.id) },
      c = asComponent(makeBody(20, 30, 40, [300, 0, 0]), a.component!.id);
    const after = await apply([a, b, c], {
      ids: [a.id, b.id],
      pivot: [0, 0, 0],
      factors: [2, 2, 2],
      mode: 'uniform',
    });
    expect(after.bodies.map((b) => bounds([b]))).toEqual([
      { min: [0, 0, 0], max: [40, 60, 80] },
      { min: [200, 0, 0], max: [240, 60, 80] },
      { min: [300, 0, 0], max: [340, 60, 80] },
    ]);
    expect(after.bodies.every((b) => b.component?.id === a.component!.id)).toBe(true);
    const old = createShape(b),
      vertex = meshBody(b, old).verticesCAD[0];
    old.delete();
    expect(resolveAnchor(after.bodies, vertex.anchor)).toEqual(vertex.point.map((n) => n * 2));
  });
  it('protects locked linked copies and supports explicit unique scaling', async () => {
    const a = asComponent(makeBody(20, 30, 40)),
      b = { ...asComponent(makeBody(20, 30, 40, [100, 0, 0]), a.component!.id), locked: true };
    const s: Scaling = { ids: [a.id], pivot: [0, 0, 0], factors: [2, 1, 1], mode: 'x' };
    expect(() => prepareScaling({ ...freshProject(), bodies: [a, b] }, s)).toThrow(/kiinnitetty/);
    const after = await apply([a, b], { ...s, unique: true });
    expect(after.bodies[1]).toEqual(b);
    expect(after.bodies[0].component).toBeUndefined();
  });
  it('allows uniform scaling of rotated linked copies, refuses conflicting directional definitions', async () => {
    const a = asComponent(makeBody(20, 30, 40)),
      b = rotateBodies(
        [asComponent(makeBody(20, 30, 40, [100, 0, 0]), a.component!.id)],
        [100, 0, 0],
        [0, 0, 1],
        45,
      )[0];
    const s: Scaling = { ids: [a.id, b.id], pivot: [0, 0, 0], factors: [2, 1, 1], mode: 'x' };
    expect(() => prepareScaling({ ...freshProject(), bodies: [a, b] }, s)).toThrow(/eri tavoin/);
    const after = await apply([a, b], { ...s, factors: [2, 2, 2], mode: 'uniform' });
    const original = bounds([b]),
      scaled = bounds([after.bodies[1]]);
    scaled.min.forEach((n, i) => expect(n).toBeCloseTo(original.min[i] * 2, 5));
    scaled.max.forEach((n, i) => expect(n).toBeCloseTo(original.max[i] * 2, 5));
  });
});
