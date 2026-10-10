import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeBox, makeCylinder, measureVolume } from 'replicad';
import { makeBody, type Vec3 } from '../model/project';
import { asComponent } from '../model/components';
import { resolveAnchor } from '../model/guides';
import { rotatePoint } from '../model/transforms';
import * as kernel from './kernel';
import { CadBuildCache } from './buildCache';
import { rotateBodies } from './transforms';
import { scaleBodies } from './scaling';
import { instantiateComponents } from './components';

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
afterEach(() => vi.restoreAllMocks());
function perforated() {
  const box = makeBox([0, 0, 0], [80, 60, 30]),
    tool = makeCylinder(8, 50, [40, 30, -10]),
    cut = box.cut(tool);
  try {
    return kernel.bodyFromShape(makeBody(80, 60, 30), cut, []);
  } finally {
    cut.delete();
    tool.delete();
    box.delete();
  }
}
function close(a: number[], b: number[], precision = 5) {
  expect(a.length).toBe(b.length);
  a.forEach((n, i) => expect(n).toBeCloseTo(b[i], precision));
}
it('moves the only complex part and replaces it with a copy without retessellation; exact anchors and circles follow', () => {
  const cache = new CadBuildCache(),
    body = perforated();
  try {
    const [original] = cache.build([body]);
    const mesh = vi.spyOn(kernel, 'meshBody'),
      create = vi.spyOn(kernel, 'createShape');
    const delta: Vec3 = [123, -45, 67],
      moved = { ...body, origin: delta };
    const [entry] = cache.build([moved]);
    expect(mesh).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(entry.mesh.triangles).toBe(original.mesh.triangles);
    expect(entry.mesh.normals).toBe(original.mesh.normals);
    expect(kernel.shapeIsValid(entry.shape)).toBe(true);
    close(kernel.exactBounds(entry.shape).min, delta);
    close(
      entry.mesh.vertices.slice(0, 3),
      original.mesh.vertices.slice(0, 3).map((v, i) => v + delta[i]),
    );
    for (const v of entry.mesh.verticesCAD) close(resolveAnchor([moved], v.anchor)!, v.point);
    const beforeCircle = original.mesh.curveEdges!.find((e) => e.circle)!.circle!;
    const afterCircle = entry.mesh.curveEdges!.find((e) => e.circle)!.circle!;
    close(
      afterCircle.center,
      beforeCircle.center.map((v, i) => v + delta[i]),
    );
    const copy = { ...moved, id: 'only-copy', origin: [250, 0, 0] as Vec3 };
    const [copied] = cache.build([copy]);
    expect(mesh).not.toHaveBeenCalled();
    expect(copied.mesh.verticesCAD.every((v) => v.anchor.bodyId === copy.id)).toBe(true);
    expect(
      copied.mesh.edgesCAD.every((e) => e.from.bodyId === copy.id && e.to.bodyId === copy.id),
    ).toBe(true);
    for (const v of copied.mesh.verticesCAD) close(resolveAnchor([copy], v.anchor)!, v.point);
    const [undo] = cache.build([body]);
    close(undo.mesh.vertices, original.mesh.vertices, 5);
    expect(mesh).not.toHaveBeenCalled();
  } finally {
    cache.dispose();
  }
});
it('invalidates geometric edits and keeps the old cache usable after an unsuccessful build', () => {
  const cache = new CadBuildCache(),
    body = makeBody(20, 30, 40);
  try {
    const [before] = cache.build([body]);
    const mesh = vi.spyOn(kernel, 'meshBody');
    const [named] = cache.build([{ ...body, name: 'Renamed', color: '#123456' }]);
    expect(named).toBe(before);
    const bad = { ...body, id: 'invalid', feature: { ...body.feature, width: 0 } };
    expect(() => cache.build([{ ...body, id: 'new' }, bad])).toThrow();
    expect(kernel.shapeIsValid(cache.get(body)!.shape)).toBe(true);
    const changed = { ...body, feature: { ...body.feature, width: 25 } };
    cache.build([changed]);
    expect(mesh).toHaveBeenCalledTimes(1);
    close(kernel.exactBounds(cache.get(changed)!.shape).max, [25, 30, 40]);
  } finally {
    cache.dispose();
  }
});
it('rotates the cached mesh and preserves face picking, circular snaps, normals and the exact solid', () => {
  const cache = new CadBuildCache();
  try {
    for (const body of [makeBody(80, 60, 30), perforated()]) {
      const [before] = cache.build([body]);
      const mesh = vi.spyOn(kernel, 'meshBody'),
        create = vi.spyOn(kernel, 'createShape');
      const pivot: Vec3 = [12, 23, 34],
        axis: Vec3 = [1, 2, 3],
        angle = 37;
      const [rotated] = rotateBodies([body], pivot, axis, angle, cache);
      const [after] = cache.build([rotated]);
      expect(mesh).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(after.mesh.triangles).toBe(before.mesh.triangles);
      const actual = kernel.meshBody(rotated, after.shape);
      expect(after.mesh.faces.map((f) => [f.ref, f.index, f.planar])).toEqual(
        actual.faces.map((f) => [f.ref, f.index, f.planar]),
      );
      after.mesh.faces.forEach((f, i) => {
        close(f.center, actual.faces[i].center, 4);
        if (f.planar) close(f.normal, actual.faces[i].normal, 4);
      });
      close(
        after.mesh.vertices.slice(0, 3),
        rotatePoint(before.mesh.vertices.slice(0, 3) as Vec3, pivot, axis, angle),
        5,
      );
      for (const v of after.mesh.verticesCAD) close(resolveAnchor([rotated], v.anchor)!, v.point);
      expect(measureVolume(after.shape.asShape3D())).toBeCloseTo(before.mesh.volume, 3);
      const circle = after.mesh.curveEdges?.find((e) => e.circle)?.circle;
      if (circle) {
        expect(circle.radius).toBe(8);
        expect(Math.hypot(...circle.normal)).toBeCloseTo(1, 8);
      }
      mesh.mockRestore();
      create.mockRestore();
    }
  } finally {
    cache.dispose();
  }
});
it('retains an accepted scale result for meshing, while an abandoned result cannot leak into another project state', async () => {
  const cache = new CadBuildCache(),
    body = perforated();
  try {
    const [original] = cache.build([body]);
    const originalVolume = original.mesh.volume;
    const create = vi.spyOn(kernel, 'createShape');
    const [scaled] = await scaleBodies([body], [0, 0, 0], [1.5, 1.5, 1.5], cache);
    const [after] = cache.build([scaled]);
    expect(create).not.toHaveBeenCalled();
    close(kernel.exactBounds(after.shape).max, [120, 90, 45], 4);
    expect(measureVolume(after.shape.asShape3D()) / originalVolume).toBeCloseTo(1.5 ** 3, 3);
    await scaleBodies([scaled], [0, 0, 0], [2, 2, 2], cache);
    const [same] = cache.build([scaled]);
    expect(same).toBe(after);
    expect(cache.get(scaled)).toBe(after);
  } finally {
    cache.dispose();
  }
});
it('updates parallel perforated linked copies without a kernel rebuild and preserves their independent appearance and frame', () => {
  const source = asComponent(perforated());
  const targets = Array.from({ length: 3 }, (_, i) => ({
    ...source,
    id: `copy-${i}`,
    origin: [200 + i * 100, 0, 0] as Vec3,
    color: '#112233',
  }));
  const cache = new CadBuildCache();
  try {
    cache.build([source, ...targets]);
    const create = vi.spyOn(kernel, 'createShape'),
      mesh = vi.spyOn(kernel, 'meshBody');
    const copies = instantiateComponents(source, targets, cache);
    expect(create).not.toHaveBeenCalled();
    expect(mesh).not.toHaveBeenCalled();
    copies.forEach((copy, i) => {
      expect(copy.feature).toEqual(source.feature);
      expect(copy.origin).toEqual(targets[i].origin);
      expect(copy.color).toBe('#112233');
    });
    cache.build(copies);
    expect(mesh).not.toHaveBeenCalled();
  } finally {
    cache.dispose();
  }
});

it('uses cached faces for push/pull measurement and offset previews, then reuses the divided mesh on commit', async () => {
  const { measureFaceSpan } = await import('./measurement');
  const { offsetOutline, offsetFace } = await import('./operations');
  const cache = new CadBuildCache(),
    body = perforated();
  try {
    const [entry] = cache.build([body]);
    const top = entry.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    const mesh = vi.spyOn(kernel, 'meshBody');
    expect(measureFaceSpan(body, top.ref, [10, 10, 30], cache).depth).toBeCloseTo(30, 5);
    expect(offsetOutline(body, top.ref, 1, cache).length).toBeGreaterThan(10);
    expect(mesh).not.toHaveBeenCalled();
    const split = offsetFace(body, top.ref, 1, cache);
    const calls = mesh.mock.calls.length;
    const [result] = cache.build([split.body]);
    expect(mesh).toHaveBeenCalledTimes(calls);
    expect(result.mesh.faces.some((f) => f.ref === split.face)).toBe(true);
    expect(kernel.shapeIsValid(result.shape)).toBe(true);
    const raised = kernel.pushPullFace(split.body, split.face, 2, cache);
    cache.build([raised]);
    expect(kernel.shapeIsValid(cache.get(raised)!.shape)).toBe(true);
  } finally {
    cache.dispose();
  }
});

it('keeps affine face ownership and exact snap geometry when tessellating before deformation', async () => {
  const cache = new CadBuildCache(),
    body = perforated();
  try {
    const [before] = cache.build([body]);
    const factors: Vec3 = [1.4, 0.8, 1.1],
      pivot: Vec3 = [20, 10, 5];
    const mesh = vi.spyOn(kernel, 'meshBody');
    const [scaled] = await scaleBodies([body], pivot, factors, cache);
    // Third argument is the verified, tolerance-tightened source tessellation.
    expect(mesh.mock.calls.at(-1)?.[2]).toBeDefined();
    const calls = mesh.mock.calls.length;
    const [entry] = cache.build([scaled]);
    expect(mesh).toHaveBeenCalledTimes(calls);
    expect(kernel.shapeIsValid(entry.shape)).toBe(true);
    expect(entry.mesh.volume / before.mesh.volume).toBeCloseTo(
      factors[0] * factors[1] * factors[2],
      3,
    );
    const actual = kernel.meshBody(scaled, entry.shape);
    expect(entry.mesh.faces.map((f) => f.index).sort((a, b) => a - b)).toEqual(
      actual.faces.map((f) => f.index).sort((a, b) => a - b),
    );
    for (const face of entry.mesh.faces) {
      const exact = actual.faces.find((f) => f.index === face.index)!;
      expect(face.ref).toBe(exact.ref);
      expect(face.planar).toBe(exact.planar);
      close(face.center, exact.center, 5);
      if (face.planar) {
        close(face.normal, exact.normal, 5);
        for (let i = face.start; i < face.start + face.count; i++) {
          const vertex = entry.mesh.triangles[i] * 3;
          const distance = face.normal.reduce(
            (sum, n, axis) => sum + n * (entry.mesh.vertices[vertex + axis] - face.center[axis]),
            0,
          );
          expect(Math.abs(distance)).toBeLessThan(0.001);
        }
      }
    }
    for (const v of entry.mesh.verticesCAD) close(resolveAnchor([scaled], v.anchor)!, v.point);
    const top = entry.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    const raised = kernel.pushPullFace(scaled, top.ref, 2, cache);
    expect(raised.feature.height).toBeCloseTo(scaled.feature.height + 2, 4);
  } finally {
    cache.dispose();
  }
});

it('does not restart whole-solid meshing when an accurate tessellation is supplied', () => {
  const body = perforated(),
    shape = kernel.createShape(body);
  try {
    const tessellation = shape.mesh({ tolerance: 0.15, angularTolerance: 0.1 });
    const surface = vi.spyOn(shape, 'mesh'),
      outline = vi.spyOn(shape, 'meshEdges');
    const mesh = kernel.meshBody(body, shape, tessellation);
    expect(surface).not.toHaveBeenCalled();
    expect(outline).not.toHaveBeenCalled();
    expect(mesh.edges.length).toBeGreaterThan(100);
    expect(mesh.curveEdges?.some((e) => e.circle?.radius === 8)).toBe(true);
    expect(mesh.vertices).toBe(tessellation.vertices);
    expect(mesh.triangles).toBe(tessellation.triangles);
  } finally {
    shape.delete();
  }
});

it('retains drawing curve stations through cached rotation, reload and another rotation', async () => {
  const { makeProfileBody } = await import('../model/project');
  const { sketchFrame } = await import('../model/sketch');
  const body = makeProfileBody(
    { kind: 'circle', radius: 30 },
    sketchFrame([0, 0, 0]),
    0,
    'Circle',
    'construction',
  );
  const cache = new CadBuildCache();
  try {
    cache.build([body]);
    const first = rotateBodies([body], [0, 0, 0], [1, 2, 3], 37, cache)[0];
    const [entry] = cache.build([first]);
    expect(entry.mesh.curveStations).toBe(true);
    const anchors = entry.mesh.verticesCAD;
    const fresh = kernel.createShape(first);
    try {
      expect(kernel.meshBody(first, fresh).verticesCAD.map((v) => v.anchor.key)).toEqual(
        anchors.map((v) => v.anchor.key),
      );
    } finally {
      fresh.delete();
    }
    const second = rotateBodies([first], [1, 2, 3], [0, 1, 0], -22, cache)[0];
    for (const v of anchors)
      close(resolveAnchor([second], v.anchor)!, rotatePoint(v.point, [1, 2, 3], [0, 1, 0], -22), 5);
  } finally {
    cache.dispose();
  }
});
