import { describe, expect, it } from 'vitest';
import { CircleGeometry, RingGeometry, Matrix4, ShapeUtils, Vector2, Vector3 } from 'three';
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

function polygon(points: Vec3[]): EditableGeometry {
  const triangles = ShapeUtils.triangulateShape(
    points.map((p) => new Vector2(p[0], p[1])),
    [],
  ).flat();
  return {
    points,
    triangles,
    sourceTriangles: triangles,
    vertexMap: points.map((_, i) => i),
    patches: new Array(triangles.length / 3).fill(0),
    groups: [{ start: 0, count: triangles.length, face: 0 }],
    exact: true,
    solid: false,
  };
}
function heightAt(g: EditableGeometry, points: Vec3[], x: number, y: number) {
  for (let i = 0; i < g.triangles.length; i += 3) {
    const [a, b, c] = g.triangles.slice(i, i + 3).map((id) => points[id]);
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
      return u * a[2] + v * b[2] + (1 - u - v) * c[2];
  }
}
const symmetricHexagon: Vec3[] = [
  [-300, 0, 250],
  [-125, 175, 250],
  [125, 175, 250],
  [300, 0, 250],
  [150, -370, 250],
  [-150, -370, 250],
];
describe('symmetric boundary deformation', () => {
  it('lowers a symmetric front edge without introducing a diagonal ridge across the part', () => {
    const g = polygon(symmetricHexagon);
    const points = g.points.map((p) => [p[0], p[1], p[1] < -300 ? 210 : p[2]] as Vec3);
    const next = retessellateGeometry(g, points);
    expect(() => validateGeometry(next, points)).not.toThrow();
    expect(next.points).toBe(g.points);
    expect(new Set(next.triangles).size).toBe(6);
    // Test the actual surface, not an arbitrary diagonal within a planar quad.
    for (let y = -300; y <= 150; y += 50)
      for (let x = -150; x <= 150; x += 25) {
        expect(heightAt(next, points, x, y)).toBeCloseTo(250 + (Math.min(0, y) * 40) / 370, 6);
        expect(heightAt(next, points, x, y)).toBeCloseTo(heightAt(next, points, -x, y)!, 6);
      }
  });
  it('preserves the same surface for a rotated part and any perimeter start or winding', () => {
    const matrix = new Matrix4().makeRotationAxis(new Vector3(1, 2, 3).normalize(), 0.73);
    matrix.setPosition(14000, -9000, 4000);
    for (const reverse of [false, true])
      for (let offset = 0; offset < 6; offset++) {
        let order = [...symmetricHexagon.slice(offset), ...symmetricHexagon.slice(0, offset)];
        if (reverse) order = order.reverse();
        const source = polygon(order),
          local = order.map((p) => [p[0], p[1], p[1] < -300 ? 210 : p[2]] as Vec3);
        const moved = local.map((p) => new Vector3(...p).applyMatrix4(matrix).toArray() as Vec3);
        const g = {
          ...source,
          points: order.map((p) => new Vector3(...p).applyMatrix4(matrix).toArray() as Vec3),
        };
        const next = retessellateGeometry(g, moved);
        expect(() => validateGeometry(next, moved)).not.toThrow();
        for (const x of [-100, 0, 100])
          expect(heightAt(next, local, x, -150)).toBeCloseTo(250 - (150 * 40) / 370, 6);
      }
  });
  it('handles a symmetric concave outline without filling the indentations', () => {
    const g = polygon([
      [-40, -60, 0],
      [40, -60, 0],
      [40, -20, 0],
      [15, -20, 0],
      [15, 20, 0],
      [40, 20, 0],
      [40, 60, 0],
      [-40, 60, 0],
      [-40, 20, 0],
      [-15, 20, 0],
      [-15, -20, 0],
      [-40, -20, 0],
    ]);
    const points = g.points.map((p) => [p[0], p[1], p[1] === -60 ? -10 : 0] as Vec3);
    const next = retessellateGeometry(g, points);
    expect(() => validateGeometry(next, points)).not.toThrow();
    expect(geometryEdges(next).filter((e) => e.boundary)).toHaveLength(12);
    expect(area(next, points)).toBeCloseTo(area(g), 6);
    expect(heightAt(next, points, 30, 0)).toBeUndefined();
    for (let y = -55; y < 60; y += 10)
      for (let x = 0; x < 40; x += 5) {
        const a = heightAt(next, points, x, y),
          b = heightAt(next, points, -x, y);
        if (a === undefined) expect(b).toBeUndefined();
        else expect(a).toBeCloseTo(b!, 6);
      }
  });
  it('does not mirror intentional asymmetric edits or move unselected anchors', () => {
    const g = polygon(symmetricHexagon);
    const points = g.points.map((p, i) => (i === 4 ? ([p[0], p[1], 210] as Vec3) : p));
    const next = retessellateGeometry(g, points);
    expect(() => validateGeometry(next, points)).not.toThrow();
    expect(heightAt(next, points, 150, -370)).toBeCloseTo(210);
    expect(heightAt(next, points, -150, -370)).toBeCloseTo(250);
    expect(next.points).toEqual(symmetricHexagon);
  });
  it('retains a collinear centre anchor on the lowered edge', () => {
    const g = polygon([...symmetricHexagon.slice(0, 5), [0, -370, 250], symmetricHexagon[5]]);
    const points = g.points.map((p) => [p[0], p[1], p[1] < -300 ? 210 : p[2]] as Vec3);
    const next = retessellateGeometry(g, points);
    expect(new Set(next.triangles).size).toBe(7);
    expect(geometryEdges(next).filter((e) => e.boundary)).toHaveLength(7);
    expect(() => validateGeometry(next, points)).not.toThrow();
    for (const x of [-100, 0, 100])
      expect(heightAt(next, points, x, -150)).toBeCloseTo(250 - (150 * 40) / 370, 6);
  });
});
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
