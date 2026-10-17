import { describe, it, expect } from 'vitest';
import { BoxGeometry, PlaneGeometry, Matrix4, Vector3 } from 'three';
import { readGeometry, cutLoop, subdivideMesh, mirrorMesh } from './mesh';
import { planeSelection, selectionPivot, transformSelection, maskSelection } from './editing';
import { validateSurface } from './validation';
import { sculptMesh, paintMask } from './sculpt';
import { paintMap, blankMap } from './maps';
import { topology, visibleFrom } from './topology';
import {
  combineSurfaces,
  surfaceTestModels,
  surfaceTestProject,
} from '../../tests/fixtures/surface-models';
import { checkRecovery } from './recovery';
import { projectSchema } from '../model/project';
import { writeFileSync } from 'node:fs';
const box = () => {
  const g = new BoxGeometry(100, 80, 60);
  const mesh = readGeometry(g);
  g.dispose();
  return mesh;
};
const plane = (z = 0) => {
  const g = new PlaneGeometry(20, 20, 4, 4);
  g.translate(0, 0, z);
  const mesh = readGeometry(g);
  g.dispose();
  return mesh;
};

describe('editable loop acceptance', () => {
  it('selects both seam copies and scales/moves a new loop while the endpoints stay fixed', () => {
    const mesh = cutLoop(box(), 2, 0),
      selected = planeSelection(mesh, 2, 0);
    expect(selected.length).toBeGreaterThan(4);
    expect(selectionPivot(mesh, selected)).toEqual([0, 0, 0]);
    const next = transformSelection(
      mesh,
      selected,
      new Matrix4().makeTranslation(0, 0, 5).multiply(new Matrix4().makeScale(0.7, 0.7, 1)),
    );
    expect(() => validateSurface(next, mesh)).not.toThrow();
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      if (selected.includes(i)) expect(next.positions[i * 3 + 2]).toBe(5);
      else
        expect(next.positions.slice(i * 3, i * 3 + 3)).toEqual(
          mesh.positions.slice(i * 3, i * 3 + 3),
        );
    }
  });
  it('rejects folded, duplicated and non-manifold triangles but accepts an intentional open sheet', () => {
    const mesh = box();
    expect(validateSurface(plane()).closed).toBe(false);
    expect(() =>
      validateSurface({
        ...mesh,
        indices: [...mesh.indices, ...mesh.indices.slice(0, 3)],
        faces: [...mesh.faces, 0],
      }),
    ).toThrow('päällekkäisiä');
    const overlap = combineSurfaces([
      mesh,
      { ...mesh, positions: mesh.positions.map((n, i) => (i % 3 === 0 ? n + 20 : n)) },
    ]);
    expect(() => validateSurface(overlap)).toThrow('leikkaavat');
    const open = { ...mesh, indices: mesh.indices.slice(3), faces: mesh.faces.slice(1) };
    expect(() => validateSurface(open, mesh)).toThrow('avaisi');
    const nonmanifold = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0],
      normals: new Array(15).fill(1),
      indices: [0, 1, 2, 1, 0, 3, 0, 1, 4],
      faces: [0, 0, 0],
    };
    expect(() => validateSurface(nonmanifold)).toThrow('yli kaksi');
  });
  it('refuses a folded loop and intersecting mirror copies without changing the source', () => {
    const mesh = cutLoop(box(), 2, 0),
      original = JSON.stringify(mesh);
    const moved = transformSelection(
      mesh,
      planeSelection(mesh, 2, 0),
      new Matrix4().makeTranslation(0, 0, 50),
    );
    expect(() => validateSurface(moved, mesh)).toThrow();
    expect(() => validateSurface(mirrorMesh(mesh, 0, 10, true))).toThrow();
    expect(JSON.stringify(mesh)).toBe(original);
  });
});
describe('brush surface targeting and protection', () => {
  it('leaves a nearby parallel disconnected surface untouched', () => {
    const front = plane(),
      behind = plane(-0.2),
      mesh = combineSurfaces([front, behind]);
    const stamp = {
      point: [0, 0, 0] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      radius: 9,
      strength: 1,
      triangle: 10,
      camera: [0, 0, 50] as [number, number, number],
    };
    const next = sculptMesh(mesh, stamp, 'raise');
    expect(next.positions.slice(front.positions.length)).toEqual(behind.positions);
    expect(next.positions.slice(0, front.positions.length)).not.toEqual(front.positions);
    const masked = paintMask(mesh, [stamp]);
    expect(masked.mask!.slice(front.positions.length / 3).every((n) => n === 0)).toBe(true);
    expect(visibleFrom(mesh, stamp.camera)([0, 0, -0.2])).toBe(false);
  });
  it('honors masks across coincident seams, subdivision, loop cuts and transformations', () => {
    const mesh = cutLoop(box(), 2, 0),
      selected = planeSelection(mesh, 2, 0);
    const g = topology(mesh),
      seam = selected.find((id) =>
        selected.some((other) => other !== id && g.ids[other] === g.ids[id]),
      )!;
    const protectedMesh = maskSelection(mesh, [seam], 1);
    const ids = topology(mesh).ids,
      twin = selected.filter((i) => ids[i] === ids[seam]);
    expect(twin.length).toBeGreaterThan(1);
    expect(twin.every((i) => protectedMesh.mask![i] === 1)).toBe(true);
    const moved = transformSelection(
      protectedMesh,
      selected,
      new Matrix4().makeTranslation(0, 0, 5),
    );
    for (const id of twin)
      expect(moved.positions.slice(id * 3, id * 3 + 3)).toEqual(
        mesh.positions.slice(id * 3, id * 3 + 3),
      );
    expect(subdivideMesh(protectedMesh).mask!.some((n) => n === 1)).toBe(true);
    expect(cutLoop(protectedMesh, 0, 5).mask!.some((n) => n === 1)).toBe(true);
  });
  it('protected paint and sculpt do not modify the masked area; removing protection permits editing', () => {
    const mesh = plane(),
      stamp = {
        point: [0, 0, 0] as [number, number, number],
        normal: [0, 0, 1] as [number, number, number],
        radius: 8,
        strength: 1,
      };
    const mask = paintMask(mesh, [stamp]);
    expect(sculptMesh(mask, stamp, 'raise').positions).toEqual(mesh.positions);
    const map = blankMap(128, [255, 255, 255]);
    expect(paintMap(mask, map, [stamp], [0, 0, 0], 1).pixels[(64 * 128 + 64) * 4]).toBe(255);
    const unmasked = paintMask(mask, [stamp], true);
    expect(sculptMesh(unmasked, stamp, 'raise').positions).not.toEqual(mesh.positions);
  });
});
describe('hardening models and recovery records', () => {
  it.each(surfaceTestModels())(
    '$id accepts without losing intended holes or normals',
    ({ mesh }) => {
      expect(validateSurface(mesh).closed).toBe(true);
      for (let i = 0; i < mesh.normals.length; i += 3)
        expect(new Vector3().fromArray(mesh.normals, i).length()).toBeCloseTo(1, 4);
    },
  );
  it('test project serializes as a regular Nivo file', () => {
    const project = surfaceTestProject();
    expect(projectSchema.safeParse(project).success).toBe(true);
    if (process.env.NIVO_WRITE_SURFACE_FIXTURES === '1')
      writeFileSync('tests/fixtures/verkko-ja-pinta-kovennus.nivo', JSON.stringify(project));
  });
  it('validates recovered selections/maps and rejects stale vertex indices', () => {
    const mesh = box(),
      record = {
        version: 1 as const,
        projectId: 'project',
        bodyId: 'body',
        sourceStamp: 'abc',
        name: 'Recovered',
        hideOriginal: true,
        updatedAt: 1,
        draft: {
          mesh,
          maps: { color: blankMap(128, [255, 255, 255]) },
          atlas: true,
          baked: false,
          selection: [0],
        },
      };
    expect(() => checkRecovery(structuredClone(record))).not.toThrow();
    expect(() =>
      checkRecovery({ ...record, draft: { ...record.draft, selection: [100000] } }),
    ).toThrow();
    expect(() =>
      checkRecovery({
        ...record,
        draft: {
          ...record.draft,
          maps: { color: { size: 128, pixels: new Uint8ClampedArray(0) } },
        },
      }),
    ).toThrow('vioittunut');
  });
});
