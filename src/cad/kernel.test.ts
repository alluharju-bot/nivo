import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createShape, meshBody, projectShapes, runProbe } from './kernel';
import { makeBody, makePolygonBody, mergeBodies } from '../model/project';

beforeAll(async () => {
  setOC(
    await initOpenCascade({
      wasmBinary: readFileSync(
        import.meta.resolve('replicad-opencascadejs/wasm').replace('file://', ''),
      ),
    }),
  );
}, 30_000);

describe('actual OpenCascade kernel', () => {
  it('fuses overlapping parts and preserves exact disconnected components in one body mesh', () => {
    for (const offset of [50, 150]) {
      const body = mergeBodies([makeBody(100, 100, 20), makeBody(100, 100, 20, [offset, 0, 0])]);
      const shape = createShape(body);
      try {
        const mesh = meshBody(body, shape);
        expect(mesh.volume).toBeCloseTo((offset === 50 ? 150 : 200) * 100 * 20, 4);
        expect(mesh.id).toBe(body.id);
        expect(mesh.verticesCAD.length).toBeGreaterThanOrEqual(8);
        expect(mesh.triangles.length).toBeGreaterThan(0);
      } finally {
        shape.delete();
      }
    }
  });
  it('closes and extrudes a concave pen outline with actual topology snap points', () => {
    const body = makePolygonBody([
      [10, 20, 0],
      [110, 20, 0],
      [110, 60, 0],
      [50, 60, 0],
      [50, 120, 0],
      [10, 120, 0],
    ]);
    for (const height of [0, 18]) {
      body.feature.height = height;
      const shape = createShape(body);
      try {
        const mesh = meshBody(body, shape);
        expect(mesh.volume).toBeCloseTo(6400 * height, 4);
        expect(mesh.verticesCAD).toHaveLength(height ? 12 : 6);
        expect(mesh.verticesCAD.some((v) => v.point[0] === 110 && v.point[1] === 120)).toBe(false);
      } finally {
        shape.delete();
      }
    }
  });
  it('extrudes, cuts, fillets and round-trips BRep with valid geometry', () => {
    const result = runProbe();
    expect(result.boxVolume).toBeCloseTo(600 * 400 * 18, 4);
    expect(result.cutVolume).toBeCloseTo((600 * 400 - 100 * 100) * 18, 4);
    expect(result.filletVolume).toBeLessThan(result.boxVolume);
    expect(result.filletVolume).toBeGreaterThan(result.boxVolume * 0.98);
    expect(result.restoredVolume).toBeCloseTo(result.boxVolume, 4);
    expect(result.valid).toBe(true);
    expect(result.faceCount).toBe(6);
    expect(result.frontPaths).toBeGreaterThan(0);
  });
  it('keeps semantic faces and millimetre coordinates when resized and translated', () => {
    const body = makeBody(600, 560, 18, [100, 20, 80]);
    const shape = createShape(body);
    try {
      const mesh = meshBody(body, shape);
      expect(new Set(mesh.faces.map((f) => f.ref))).toEqual(
        new Set(['x:min', 'x:max', 'y:min', 'y:max', 'z:min', 'z:max']),
      );
      expect(mesh.volume).toBeCloseTo(600 * 560 * 18, 4);
      const front = projectShapes([shape], 'front');
      expect(front.viewBox[2]).toBeCloseTo(600, 3);
      expect(front.viewBox[3]).toBeCloseTo(18, 3);
    } finally {
      shape.delete();
    }
  });
  it('creates an exact planar sketch before push/pull', () => {
    const body = makeBody(600, 400, 0);
    const shape = createShape(body);
    try {
      expect(meshBody(body, shape).volume).toBe(0);
    } finally {
      shape.delete();
    }
  });
  it('rejects an impossible fillet without damaging the previous solid', () => {
    const body = makeBody(600, 400, 18),
      shape = createShape(body).asShape3D();
    const attempt = shape.clone();
    try {
      expect(() => attempt.fillet(1000)).toThrow();
      expect(meshBody(body, shape).volume).toBeCloseTo(4_320_000, 3);
    } finally {
      attempt.delete();
      shape.delete();
    }
  });
});
