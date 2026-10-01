import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, parseProject, freshProject } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, shapeIsValid } from './kernel';
import { booleanBodies } from './operations';
import { detailEdges } from './details';

beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

describe('exact fillets and chamfers', () => {
  it.each(['fillet', 'chamfer'] as const)(
    'finishes every box edge with %s and survives serialization',
    (operation) => {
      const original = makeBody(100, 80, 40),
        shape = createShape(original);
      const edges = meshBody(original, shape).detailEdges!;
      shape.delete();
      const result = detailEdges(
        original,
        edges.map((e) => e.index),
        operation,
        3,
      );
      expect(result.body.id).toBe(original.id);
      expect(result.mesh.volume).toBeLessThan(100 * 80 * 40);
      expect(result.mesh.volume).toBeGreaterThan(300000);
      expect(result.mesh.faces.length).toBeGreaterThan(6);
      expect(result.body.feature.type).toBe('brep');
      expect(result.body.feature.width).toBeCloseTo(100, 6);
      expect(result.body.feature.depth).toBeCloseTo(80, 6);
      expect(result.body.feature.height).toBeCloseTo(40, 6);
      const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }));
      const restored = createShape(saved.bodies[0]);
      try {
        expect(shapeIsValid(restored)).toBe(true);
        expect(meshBody(result.body, restored).volume).toBeCloseTo(result.mesh.volume, 4);
      } finally {
        restored.delete();
      }
      expect(original.feature.type).toBe('rectangle-extrusion');
    },
  );
  it('chamfers only the chosen vertical edge and removes the expected triangular prism', () => {
    const body = makeBody(100, 80, 40),
      shape = createShape(body),
      edges = shape.edges;
    const index = edges.findIndex((e) => {
      const a = e.startPoint,
        b = e.endPoint;
      try {
        return (
          a.toTuple()[0] === 0 &&
          a.toTuple()[1] === 0 &&
          b.toTuple()[0] === 0 &&
          b.toTuple()[1] === 0
        );
      } finally {
        a.delete();
        b.delete();
      }
    });
    edges.forEach((e) => e.delete());
    shape.delete();
    const result = detailEdges(body, [index], 'chamfer', 4);
    expect(result.mesh.volume).toBeCloseTo(100 * 80 * 40 - 0.5 * 4 * 4 * 40, 4);
    expect(result.mesh.faces).toHaveLength(7);
  });
  it('rounds circular cylinder edges, including a subsequent edit of saved BRep', () => {
    const body = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([0, 0, 0]), 80);
    const shape = createShape(body),
      mesh = meshBody(body, shape);
    const curved = mesh.detailEdges!.find(
      (e) => e.lines.length > 6 && e.lines.every((n, i) => i % 3 !== 2 || Math.abs(n) < 1e-5),
    )!;
    shape.delete();
    const result = detailEdges(body, [curved.index], 'fillet', 3);
    expect(result.mesh.volume).toBeLessThan(mesh.volume);
    expect(result.body.feature.type).toBe('brep');
    const other = result.mesh.detailEdges!.find((e) =>
      e.lines.every((n, i) => i % 3 !== 2 || Math.abs(n - 80) < 1e-5),
    );
    expect(other).toBeDefined();
    expect(detailEdges(result.body, [other!.index], 'fillet', 2).mesh.volume).toBeLessThan(
      result.mesh.volume,
    );
  });
  it.each(['fillet', 'chamfer'] as const)(
    'finishes a through-hole rim with %s and preserves part metadata',
    (operation) => {
      const plate = {
        ...makeBody(100, 80, 18, [0, 0, 0], 'Reikälevy'),
        material: 'wood' as const,
        groupId: 'cabinet',
      };
      const cutter = makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 40, -5]), 30);
      const body = booleanBodies([plate], [cutter], 'cut')[0];
      const shape = createShape(body),
        mesh = meshBody(body, shape);
      shape.delete();
      const rim = mesh.detailEdges!.find(
        (edge) =>
          edge.lines.length > 6 &&
          edge.lines.every((n, i) => i % 3 !== 2 || Math.abs(n - 18) < 1e-5),
      );
      expect(rim).toBeDefined();
      const result = detailEdges(body, [rim!.index], operation, 2);
      expect(result.mesh.volume).toBeLessThan(mesh.volume);
      expect(result.mesh.volume).toBeGreaterThan(mesh.volume * 0.98);
      expect(result.body).toMatchObject({
        id: plate.id,
        name: 'Reikälevy',
        material: 'wood',
        groupId: 'cabinet',
        color: plate.color,
      });
      expect(result.body.feature.height).toBeCloseTo(18, 6);
    },
  );
  it('rejects invalid sizes, stale edge indices, flat shapes and Hold without mutating input', () => {
    const body = makeBody(100, 80, 40),
      saved = JSON.stringify(body);
    expect(() => detailEdges(body, [9999], 'fillet', 2)).toThrow('Valitse');
    expect(() => detailEdges(body, [0], 'fillet', 1000)).toThrow('Pienennä');
    expect(() => detailEdges(body, [], 'chamfer', 3)).toThrow('Valitse');
    expect(() => detailEdges(body, [0], 'fillet', -2)).toThrow('mitta');
    expect(() => detailEdges({ ...body, locked: true }, [0], 'chamfer', 2)).toThrow('kiinnitetty');
    expect(() => detailEdges(makeBody(100, 100, 0), [0], 'fillet', 2)).toThrow('paksuus');
    expect(JSON.stringify(body)).toBe(saved);
  });
});
