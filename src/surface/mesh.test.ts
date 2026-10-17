import { describe, expect, it } from 'vitest';
import { BoxGeometry, PlaneGeometry, Vector3 } from 'three';
import { makeBody, projectSchema, freshProject } from '../model/project';
import { meshClosure } from '../exchange/mesh';
import {
  checkMesh,
  cutLoop,
  mirrorMesh,
  symmetricMesh,
  primitiveMesh,
  readGeometry,
  simplifyMesh,
  subdivideMesh,
  surfaceBody,
} from './mesh';
import { sculptMesh } from './sculpt';
import { bakeSurface, type BakeSource } from './bake';
import { blankMap, paintMap, rasterTriangle } from './maps';
import { SurfaceHistory } from './history';

const box = () => {
  const g = new BoxGeometry(100, 80, 60);
  const m = readGeometry(g);
  g.dispose();
  return m;
};
const volume = (m: ReturnType<typeof box>) => {
  let value = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = m.indices
      .slice(i, i + 3)
      .map((j) => new Vector3().fromArray(m.positions, j * 3));
    value += a.dot(b.cross(c)) / 6;
  }
  return value;
};
describe('surface topology', () => {
  it('low segment circles, spheres and cylinders remain valid and bounded', () => {
    for (const kind of ['circle', 'sphere', 'cylinder'] as const)
      for (const segments of [3, 8, 24]) {
        const m = primitiveMesh(kind, 20, 50, segments);
        expect(() => checkMesh(m)).not.toThrow();
        expect(meshClosure(m.positions, m.indices).closed).toBe(kind !== 'circle');
      }
    expect(primitiveMesh('sphere', 20, 20, 8).indices.length).toBeLessThan(
      primitiveMesh('sphere', 20, 20, 32).indices.length,
    );
  });
  it('loop cuts preserve a closed shell, volume, UV interpolation and face assignments', () => {
    const m = box();
    m.faces = m.faces.map((_, i) => Math.floor(i / 2));
    const n = cutLoop(cutLoop(m, 2, 0), 0, 17);
    expect(meshClosure(n.positions, n.indices).closed).toBe(true);
    expect(volume(n)).toBeCloseTo(volume(m), 5);
    expect(n.indices.length).toBeGreaterThan(m.indices.length);
    expect(new Set(n.faces).size).toBe(6);
    expect(n.uv).toHaveLength((n.positions.length / 3) * 2);
    expect(() => cutLoop(m, 2, 100)).toThrow('ei leikkaa');
  });
  it('mirror reverses winding with normals; a disjoint copy doubles positive volume', () => {
    const m = box(),
      n = mirrorMesh(m, 0, 80, false),
      copy = mirrorMesh(m, 0, 80, true);
    expect(volume(n)).toBeCloseTo(volume(m), 5);
    expect(volume(copy)).toBeCloseTo(volume(m) * 2, 5);
    expect(meshClosure(copy.positions, copy.indices).closed).toBe(true);
    expect(mirrorMesh(n, 0, 80, false)).toEqual(m);
  });
  it('subdivision preserves shape and watertightness and gives the brush local vertices', () => {
    let m = box();
    for (let i = 0; i < 3; i++) m = subdivideMesh(m);
    expect(volume(m)).toBeCloseTo(480000, 4);
    expect(meshClosure(m.positions, m.indices).closed).toBe(true);
    const changed = sculptMesh(
      m,
      { point: [0, 0, 30], normal: [0, 0, 1], radius: 20, strength: 3 },
      'raise',
    );
    expect(Math.max(...changed.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(33);
    expect(changed.positions.slice(0, 3)).toEqual(m.positions.slice(0, 3));
    expect(meshClosure(changed.positions, changed.indices).closed).toBe(true);
  });
  it('bisects and mirrors a half with a watertight seam and outward faces', () => {
    const m = box(),
      result = symmetricMesh(m, 0, 7);
    expect(meshClosure(result.positions, result.indices).closed).toBe(true);
    expect(volume(result)).toBeCloseTo(86 * 80 * 60, 4);
    expect(Math.min(...result.positions.filter((_, i) => i % 3 === 0))).toBeCloseTo(-36);
  });
  it('simplifies a sphere without opening the solid or mutating its source', async () => {
    const m = primitiveMesh('sphere', 30, 10, 32),
      old = JSON.stringify(m),
      next = await simplifyMesh(m, 0.5);
    expect(next.indices.length).toBeLessThan(m.indices.length);
    expect(meshClosure(next.positions, next.indices).closed).toBe(true);
    expect(JSON.stringify(m)).toBe(old);
  });
  it('persists an independent mesh without carrying CAD treatments or changing the source', () => {
    const source = makeBody(100, 80, 60),
      old = JSON.stringify(source),
      result = surfaceBody(source, box());
    expect(result.id).not.toBe(source.id);
    expect(result.component).toBeUndefined();
    expect(result.feature.type).toBe('mesh');
    expect(JSON.stringify(source)).toBe(old);
    expect(
      projectSchema.parse({ ...freshProject(), bodies: [source, result] }).bodies[1].surfaceWorkflow
        ?.sourceId,
    ).toBe(source.id);
  });
});
describe('surface texture calculation', () => {
  const plane = () => {
    const g = new PlaneGeometry(10, 10);
    const m = readGeometry(g);
    g.dispose();
    return m;
  };
  const source = (mesh = plane()): BakeSource => ({
    mesh,
    materials: { 0: { color: [1, 0.25, 0], roughness: 0.8, metalness: 0.2, normalScale: [1, 1] } },
  });
  it('bakes neutral tangent normals, linear material values and no self AO on a plane', () => {
    const mesh = plane(),
      result = bakeSurface(mesh, source(mesh), {
        size: 128,
        cage: 1,
        aoDistance: 5,
        samples: 8,
        details: true,
      });
    const p = (64 * 128 + 64) * 4;
    expect(Array.from(result.maps.normal!.pixels.slice(p, p + 3))).toEqual([128, 128, 255]);
    expect(result.maps.ao!.pixels[p]).toBe(255);
    expect(result.maps.roughness!.pixels[p]).toBe(204);
    expect(result.maps.metalness!.pixels[p]).toBe(51);
    expect(result.maps.color!.pixels[p]).toBe(255);
    expect(result.maps.color!.pixels[p + 1]).toBeCloseTo(137, 0);
    expect(result.missed).toBe(0);
  });
  it('rejects a reference that does not meet the target within the cage', () => {
    const mesh = plane(),
      high = plane();
    high.positions = high.positions.map((n, i) => (i % 3 === 2 ? n + 100 : n));
    expect(() =>
      bakeSurface(mesh, source(high), {
        size: 128,
        cage: 1,
        aoDistance: 5,
        samples: 8,
        details: false,
      }),
    ).toThrow('ei tavoita');
  });
  it('UV remapping samples its own triangle even when a nearby surface occludes a projection ray', () => {
    const target = plane(),
      upper = plane();
    upper.positions = upper.positions.map((n, i) => (i % 3 === 2 ? n + 0.1 : n));
    const high = {
      positions: [...target.positions, ...upper.positions],
      normals: [...target.normals, ...upper.normals],
      indices: [...target.indices, ...upper.indices.map((i) => i + target.positions.length / 3)],
      uv: [...target.uv!, ...upper.uv!],
      faces: [0, 0, 1, 1],
    };
    const reference: BakeSource = {
      mesh: high,
      materials: {
        0: { color: [1, 0, 0], roughness: 1, metalness: 0, normalScale: [1, 1] },
        1: { color: [0, 0, 1], roughness: 1, metalness: 0, normalScale: [1, 1] },
      },
    };
    const result = bakeSurface(target, reference, {
      size: 128,
      cage: 1,
      aoDistance: 1,
      samples: 8,
      details: false,
      correspondence: true,
    });
    const p = (64 * 128 + 64) * 4;
    expect(Array.from(result.maps.color!.pixels.slice(p, p + 3))).toEqual([255, 0, 0]);
  });
  it('paints through shared UV triangle seams and preserves the untouched texture', () => {
    const m = plane(),
      map = blankMap(128, [255, 255, 255]),
      next = paintMap(
        m,
        map,
        [{ point: [0, 0, 0], normal: [0, 0, 1], radius: 3, strength: 1 }],
        [255, 0, 0],
        1,
      );
    expect(next.pixels[(64 * 128 + 64) * 4 + 1]).toBeLessThan(5);
    expect(next.pixels[(1 * 128 + 1) * 4 + 1]).toBe(255);
    expect(map.pixels.every((n) => n === 255)).toBe(true);
  });
  it('does not paint the opposite side of a thin surface', () => {
    const m = plane(),
      map = blankMap(128, [255, 255, 255]),
      next = paintMap(
        m,
        map,
        [{ point: [0, 0, -0.1], normal: [0, 0, -1], radius: 3, strength: 1 }],
        [0, 0, 0],
        1,
      );
    expect(next).toEqual(map);
  });
  it('local history restores topology and texture together', () => {
    const mesh = plane(),
      history = new SurfaceHistory(),
      a = { mesh, maps: { color: blankMap(128, [1, 2, 3]) }, atlas: true, baked: false },
      b = { ...a, mesh: subdivideMesh(mesh) };
    history.push(a);
    expect(history.undo(b)).toBe(a);
    expect(history.redo(a)).toBe(b);
  });
  it('history accepts invalidated normal and AO slots during repeated mesh editing', () => {
    const mesh = plane(),
      history = new SurfaceHistory();
    const draft = { mesh, maps: { normal: undefined, ao: undefined }, atlas: false, baked: false };
    expect(() => {
      history.push(draft);
      history.push({ ...draft, mesh: subdivideMesh(mesh) });
    }).not.toThrow();
    expect(history.past).toHaveLength(2);
  });
});
