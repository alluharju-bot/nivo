import { describe, expect, it } from 'vitest';
import { CircleGeometry, RingGeometry, Matrix4 } from 'three';
import {
  editableGeometry,
  geometryEdges,
  geometryMatrix,
  geometryMeshBody,
  meshClosed,
  transformGeometryPoints,
  validateGeometry,
  type EditableGeometry,
} from './geometryEditing';
import { retessellateGeometry } from './geometryRetessellation';
import { geometryInfluence, transformWithInfluence } from './geometryInfluence';
import { makeBody, bodySchema, type Vec3 } from './project';
import { defaultAppearance } from './materials';

function disk(hole = false) {
  const mesh = hole ? new RingGeometry(10, 30, 32) : new CircleGeometry(30, 32);
  const body = makeBody(60, 60, 0);
  const vertices = Array.from(mesh.attributes.position.array),
    triangles = Array.from(mesh.index!.array);
  const g = editableGeometry(
    body,
    { vertices, triangles, faces: [{ start: 0, count: triangles.length, index: 0 }] as never },
    false,
  );
  mesh.dispose();
  return g;
}
function area(g: EditableGeometry, points = g.points) {
  let a = 0;
  for (let i = 0; i < g.triangles.length; i += 3) {
    const [p, q, r] = g.triangles.slice(i, i + 3).map((j) => points[j]);
    a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
  }
  return a;
}
describe('boundary based editing', () => {
  it('handles a large curved patch within the editor limits without argument overflow', () => {
    const width = 250,
      height = 100;
    const points: Vec3[] = Array.from({ length: (width + 1) * (height + 1) }, (_, i) => {
      const x = i % (width + 1),
        y = Math.floor(i / (width + 1));
      return [x, y, Math.sin(x / 20) * 10];
    });
    const triangles: number[] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const a = y * (width + 1) + x,
          b = a + width + 1;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const g: EditableGeometry = {
      points,
      triangles,
      sourceTriangles: triangles,
      vertexMap: points.map((_, i) => i),
      patches: new Array(triangles.length / 3).fill(0),
      groups: [{ start: 0, count: triangles.length, face: 0 }],
      exact: false,
      solid: false,
    };
    const moved = points.map((p, i) => (i === 0 ? ([p[0], p[1], p[2] + 1] as Vec3) : p));
    const next = retessellateGeometry(g, moved);
    expect(next.triangles).toEqual(triangles);
    expect(next.sourceTriangles).toEqual(triangles);
  });
  it('retains collinear perimeter anchors, including a midpoint lifted out of plane', () => {
    const points: Vec3[] = [
        [0, 0, 0],
        [50, 0, 0],
        [100, 0, 0],
        [100, 100, 0],
        [0, 100, 0],
      ],
      triangles = [0, 1, 4, 1, 3, 4, 1, 2, 3];
    const g: EditableGeometry = {
      points,
      triangles,
      sourceTriangles: triangles,
      vertexMap: [0, 1, 2, 3, 4],
      patches: [0, 0, 0],
      groups: [{ start: 0, count: 9, face: 0 }],
      exact: true,
      solid: false,
    };
    for (const [id, delta] of [
      [1, [0, 0, 10]],
      [3, [-10, 0, 0]],
    ] as [number, Vec3][]) {
      const next = transformGeometryPoints(points, [id], geometryMatrix('move', delta, [0, 0, 0]));
      const rebuilt = retessellateGeometry(g, next);
      expect(new Set(rebuilt.triangles).size).toBe(5);
      expect(geometryEdges(rebuilt).filter((e) => e.boundary)).toHaveLength(5);
      expect(() => validateGeometry(rebuilt, next)).not.toThrow();
    }
  });
  it('retriangulates a concave disk rim instead of folding its original fan', () => {
    const g = disk(),
      i = g.points.findIndex((p) => p[0] > 29);
    const points = g.points.map((p, j) => (j === i ? ([-12, p[1], p[2]] as Vec3) : p));
    // Interior centre would be outside this severe indentation; reject rather than lose it.
    expect(() => retessellateGeometry(g, points)).toThrow();
    const p = g.points.map((p, j) => (j === i ? ([8, p[1], p[2]] as Vec3) : p)),
      next = retessellateGeometry(g, p);
    expect(() => validateGeometry(next, p)).not.toThrow();
    expect(
      geometryEdges(next)
        .map((e) => [e.a, e.b].sort().join(':'))
        .sort(),
    ).toEqual(
      geometryEdges(g)
        .map((e) => [e.a, e.b].sort().join(':'))
        .sort(),
    );
    expect(area(next, p)).toBeLessThan(area(g));
  });
  it('localizes a lifted boundary vertex instead of retaining a long triangle fan', () => {
    // Circle fan rooted at rim vertex zero, the troublesome CAD tessellation.
    const points: Vec3[] = Array.from({ length: 32 }, (_, i) => [
      30 * Math.cos((i * Math.PI) / 16),
      30 * Math.sin((i * Math.PI) / 16),
      0,
    ]);
    const triangles = Array.from({ length: 30 }, (_, i) => [0, i + 1, i + 2]).flat();
    const g: EditableGeometry = {
      points,
      triangles,
      sourceTriangles: triangles,
      vertexMap: points.map((_, i) => i),
      patches: new Array(30).fill(0),
      groups: [{ start: 0, count: 90, face: 0 }],
      exact: false,
      solid: false,
    };
    const moved = points.map((p, i) => (i === 0 ? ([p[0], p[1], 10] as Vec3) : p));
    const next = retessellateGeometry(g, moved);
    expect(next.triangles.filter((i) => i === 0).length).toBeLessThan(5);
    expect(() => validateGeometry(next, moved)).not.toThrow();
    expect(next.triangles.length).toBe(triangles.length);
  });
  it('preserves an annular hole through moves, scaling, serialization and sequential edits', () => {
    const g = disk(true),
      body = geometryMeshBody(makeBody(60, 60, 0), g, g.points);
    const ids = g.points.flatMap((p, i) => (Math.hypot(p[0], p[1]) < 11 ? [i] : []));
    const points = transformGeometryPoints(
      g.points,
      ids,
      geometryMatrix('move', [0, 0, -10], [0, 0, 0]),
    );
    const next = retessellateGeometry(g, points);
    expect(() => validateGeometry(next, points)).not.toThrow();
    const result = bodySchema.parse(
      JSON.parse(JSON.stringify(geometryMeshBody(body, next, points))),
    );
    expect(result.feature.type).toBe('mesh');
    if (result.feature.type !== 'mesh') throw Error();
    expect(result.feature.patches).toEqual(next.patches);
    expect(result.feature.solid).toBe(false);
    expect(meshClosed(next.triangles)).toBe(false);
    expect(geometryEdges(next).filter((e) => e.boundary).length).toBe(64);
    const scaled = transformGeometryPoints(
      points,
      ids,
      geometryMatrix('scale', [0.8, 0.8, 1], [0, 0, -10]),
    );
    const again = retessellateGeometry({ ...next, points }, scaled);
    expect(() => validateGeometry(again, scaled)).not.toThrow();
    expect(geometryEdges(again).filter((e) => e.boundary).length).toBe(64);
  });
  it('keeps material subdivisions and does not show the new diagonals as editable seams', () => {
    const g = disk(),
      body = {
        ...makeBody(60, 60, 0),
        faceMaterials: { 0: { color: '#ad7339', appearance: defaultAppearance('matte') } },
      };
    const points = g.points.map((p, i) => (i === 1 ? ([p[0], p[1], 5] as Vec3) : p)),
      next = retessellateGeometry(g, points);
    const result = geometryMeshBody(body, next, points);
    expect(result.faceMaterials?.[0].color).toBe('#ad7339');
    expect(geometryEdges(next).length).toBe(geometryEdges(g).length);
  });
});
describe('surface influence', () => {
  it('does not jump a hole or affect the unselected rim', () => {
    const g = disk(true),
      i = g.points.findIndex((p) => p[0] > 29),
      weights = geometryInfluence(g, [i], 25);
    g.points.forEach((p, j) => {
      if (Math.hypot(p[0], p[1]) < 11) expect(weights[j]).toBe(0);
    });
    expect(weights[i]).toBe(1);
    expect([...weights].some((w) => w > 0 && w < 1)).toBe(true);
    const moved = transformWithInfluence(
      g.points,
      weights,
      new Matrix4().makeTranslation(0, 0, 10),
    );
    expect(moved[i][2]).toBe(10);
    expect(() => validateGeometry(retessellateGeometry(g, moved), moved)).not.toThrow();
  });
  it('uses exact selection when disabled and never affects a nearby disconnected shell', () => {
    const g = disk(),
      offset = g.points.length;
    const combined = {
      ...g,
      points: [...g.points, ...g.points.map((p) => [p[0], p[1], 0.01] as Vec3)],
      triangles: [...g.triangles, ...g.triangles.map((i) => i + offset)],
    };
    const exact = geometryInfluence(combined, [1], 0),
      soft = geometryInfluence(combined, [1], 1000);
    expect([...exact].filter((x) => x > 0)).toHaveLength(1);
    expect([...soft].slice(offset).every((w) => w === 0)).toBe(true);
  });
});
