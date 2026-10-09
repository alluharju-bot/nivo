import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makePolygon, makeSolid } from 'replicad';
import { makeBody, makeProfileBody, parseProject, freshProject } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, shapeIsValid, bodyFromShape } from './kernel';
import { booleanBodies } from './operations';
import { detailEdges, removeEdgeTreatment } from './details';
import { rotateBodies } from './transforms';
import { pushPullFace } from './kernel';
import { filletPrism } from './prismFillet';
import { profileCorners } from '../model/profileCorners';

beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

describe('exact fillets and chamfers', () => {
  it.each([false, true])(
    'makes exact semicircular ends at half width, including a rotated saved prism (%s)',
    (rotated) => {
      let body = makeBody(4, 24, 6);
      if (rotated) body = rotateBodies([body], [0, 0, 0], [1, 2, 3], 37)[0];
      const shape = createShape(body),
        mesh = meshBody(body, shape);
      shape.delete();
      const indices = mesh
        .detailEdges!.filter(
          (e) =>
            e.lines.length === 6 &&
            Math.abs(Math.hypot(...e.lines.slice(0, 3).map((n, i) => n - e.lines[i + 3])) - 6) <
              1e-5,
        )
        .map((e) => e.index);
      expect(indices).toHaveLength(4);
      const result = detailEdges(body, indices, 'fillet', 2);
      expect(result.mesh.volume).toBeCloseTo((4 * 20 + Math.PI * 4) * 6, 5);
      const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }))
        .bodies[0];
      const savedShape = createShape(restored);
      expect(shapeIsValid(savedShape)).toBe(true);
      savedShape.delete();
      expect(detailEdges(restored, indices, 'fillet', 1, true).mesh.volume).toBeGreaterThan(
        result.mesh.volume,
      );
      expect(() => detailEdges(restored, indices, 'fillet', 2.01, true)).toThrow('Pienennä');
    },
  );
  it('rounds a square extrusion completely into a cylinder without leaving tiny flat faces', () => {
    const body = makeBody(4, 4, 24),
      shape = createShape(body);
    const indices = meshBody(body, shape)
      .detailEdges!.filter((e) => Math.abs(e.lines[5] - e.lines[2]) > 23)
      .map((e) => e.index);
    shape.delete();
    const result = detailEdges(body, indices, 'fillet', 2);
    expect(result.mesh.volume).toBeCloseTo(Math.PI * 4 * 24, 5);
    expect(result.mesh.faces.filter((f) => f.planar)).toHaveLength(2);
  });
  it('keeps a through-hole when rebuilding one semicircular end, and refuses a blind pocket', () => {
    const original = makeBody(4, 24, 6);
    const cutter = makeProfileBody({ kind: 'circle', radius: 0.5 }, sketchFrame([2, 12, 0]), 6);
    const body = booleanBodies([original], [cutter], 'cut')[0];
    const shape = createShape(body),
      edges = shape.edges;
    try {
      const indices = meshBody(body, shape)
        .detailEdges!.filter(
          (e) =>
            e.lines.length === 6 &&
            Math.abs(e.lines[5] - e.lines[2]) > 5.99 &&
            Math.abs(e.lines[1]) < 1e-6,
        )
        .map((e) => e.index);
      expect(indices).toHaveLength(2);
      const rounded = filletPrism(
        shape,
        indices.map((i) => edges[i]),
        2,
      )!;
      expect(rounded).toBeDefined();
      try {
        expect(shapeIsValid(rounded)).toBe(true);
        expect(meshBody(body, rounded).volume).toBeCloseTo(
          (4 * 22 + Math.PI * 2 - Math.PI * 0.25) * 6,
          5,
        );
      } finally {
        rounded.delete();
      }
    } finally {
      edges.forEach((e) => e.delete());
      shape.delete();
    }
    const pocket = booleanBodies([original], [{ ...cutter, origin: [2, 12, 5] }], 'cut')[0];
    const pocketShape = createShape(pocket),
      pocketEdges = pocketShape.edges;
    try {
      const indices = meshBody(pocket, pocketShape)
        .detailEdges!.filter(
          (e) => e.lines.length === 6 && Math.abs(e.lines[5] - e.lines[2]) > 5.99,
        )
        .map((e) => e.index);
      expect(
        filletPrism(
          pocketShape,
          indices.map((i) => pocketEdges[i]),
          2,
        ),
      ).toBeUndefined();
      expect(shapeIsValid(pocketShape)).toBe(true);
    } finally {
      pocketEdges.forEach((e) => e.delete());
      pocketShape.delete();
    }
  });
  it('finds extrusion corners and the exact half-width after retaining and rotating a treatment', () => {
    const body = makeProfileBody(
      { kind: 'rectangle', width: 4, depth: 24 },
      sketchFrame([4, 8, 12], [0, -1, 0]),
      6,
    );
    const shape = createShape(body);
    const corners = profileCorners(body, meshBody(body, shape))!;
    shape.delete();
    expect(corners.indices).toHaveLength(4);
    expect(corners.halfWidth).toBe(2);
    const rounded = detailEdges(body, corners.indices, 'fillet', 2).body;
    const rotated = rotateBodies([rounded], [0, 0, 0], [2, 3, 4], 71)[0];
    const resultShape = createShape(rotated);
    try {
      expect(profileCorners(rotated, meshBody(rotated, resultShape))).toEqual(corners);
    } finally {
      resultShape.delete();
    }
  });
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

describe('retained edge treatments', () => {
  const cornerEdges = (body: ReturnType<typeof makeBody>) => {
    const shape = createShape(body);
    try {
      return meshBody(body, shape)
        .detailEdges!.filter((e) =>
          e.lines.some(
            (_, i) =>
              i % 3 === 0 &&
              e.lines.slice(i, i + 3).every((v, j) => Math.abs(v - body.origin[j]) < 1e-6),
          ),
        )
        .map((e) => e.index);
    } finally {
      shape.delete();
    }
  };
  it.each([
    [600, 600, 18],
    [18, 560, 2400],
  ])('rebuilds three meeting cabinet edges on %j from their source', (w, d, h) => {
    const body = makeBody(w, d, h),
      indices = cornerEdges(body);
    expect(indices).toHaveLength(3);
    const first = detailEdges(body, [indices[0]], 'fillet', 3).body;
    const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [first] })).bodies[0];
    const joined = detailEdges(restored, indices, 'fillet', 3, true);
    const direct = detailEdges(body, indices, 'fillet', 3);
    expect(joined.mesh.volume).toBeCloseTo(direct.mesh.volume, 5);
    expect(joined.body.edgeTreatment?.id).toBe(first.edgeTreatment?.id);
    expect(joined.mesh.sourceDetailEdges).toHaveLength(12);
    const smaller = detailEdges(joined.body, indices, 'fillet', 2, true);
    expect(smaller.mesh.volume).toBeGreaterThan(joined.mesh.volume);
    const fewer = detailEdges(smaller.body, [indices[0]], 'fillet', 2, true);
    expect(fewer.mesh.volume).toBeGreaterThan(smaller.mesh.volume);
  });
});

it('preserves editable source indices through movement, rotation and copying, and finalizes before a face edit', () => {
  const body = makeBody(600, 560, 18, [30, 40, 50]);
  const first = detailEdges(body, [0, 1, 2], 'fillet', 2);
  const moved = { ...first.body, id: 'copy', origin: [130, 240, 350] as [number, number, number] };
  const rotated = rotateBodies([moved], [0, 0, 0], [1, 2, 3], 37)[0];
  const result = detailEdges(rotated, rotated.edgeTreatment!.indices, 'fillet', 3, true);
  const comparison = detailEdges({ ...body, origin: moved.origin }, [0, 1, 2], 'fillet', 3);
  expect(result.mesh.volume).toBeCloseTo(comparison.mesh.volume, 3);
  const removed = removeEdgeTreatment(result.body),
    shape = createShape(removed);
  expect(removed.edgeTreatment).toBeUndefined();
  expect(meshBody(removed, shape).volume).toBeCloseTo(600 * 560 * 18, 3);
  shape.delete();
  const top = first.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
  const pushed = pushPullFace(first.body, top.ref, 5);
  expect(pushed.edgeTreatment).toBeUndefined();
  expect(pushed.feature.height).toBeCloseTo(23, 4);
});
it('joins three outer corner rounds on an already hollow cabinet', () => {
  const outer = makeBody(600, 600, 2400),
    inner = makeBody(564, 610, 2364, [18, -28, 18]);
  const body = booleanBodies([outer], [inner], 'cut')[0],
    shape = createShape(body);
  const indices = meshBody(body, shape)
    .detailEdges!.filter((e) =>
      e.lines.some(
        (_, i) => i % 3 === 0 && e.lines.slice(i, i + 3).every((v) => Math.abs(v) < 1e-6),
      ),
    )
    .map((e) => e.index);
  shape.delete();
  expect(indices).toHaveLength(3);
  const first = detailEdges(body, [indices[0]], 'fillet', 2);
  const result = detailEdges(first.body, indices, 'fillet', 2, true);
  expect(result.mesh.volume).toBeLessThan(first.mesh.volume);
  expect(result.body.feature.type === 'brep' && result.body.feature.solid).toBe(true);
});

it('checks a four-way pyramid apex against the exact fillet kernel', () => {
  const apex: [number, number, number] = [50, 50, 100];
  const bottom: [number, number, number][] = [
    [0, 0, 0],
    [100, 0, 0],
    [100, 100, 0],
    [0, 100, 0],
  ];
  const faces = [
    makePolygon([...bottom].reverse()),
    ...bottom.map((p, i) => makePolygon([p, bottom[(i + 1) % 4], apex])),
  ];
  const solid = makeSolid(faces);
  try {
    const body = bodyFromShape(makeBody(100, 100, 100), solid),
      mesh = meshBody(body, solid);
    const indices = mesh
      .detailEdges!.filter((e) =>
        e.lines.some(
          (_, i) =>
            i % 3 === 0 && e.lines.slice(i, i + 3).every((n, j) => Math.abs(n - apex[j]) < 1e-5),
        ),
      )
      .map((e) => e.index);
    expect(indices).toHaveLength(4);
    const result = detailEdges(body, indices, 'fillet', 2);
    expect(result.mesh.volume).toBeGreaterThan(300000);
    expect(result.mesh.volume).toBeLessThan(mesh.volume);
  } finally {
    solid.delete();
    faces.forEach((f) => f.delete());
  }
});
