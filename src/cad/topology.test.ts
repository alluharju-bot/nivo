import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeBox, makeCompound, drawCircle, type AnyShape, type Sketch } from 'replicad';
import { shapeEdges, shapeFaces } from './topology';
import { cutShapes } from './cut';
import { createShape, meshBody, bodyFromShape } from './kernel';
import { makeBody, makeProfileBody } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { shapeVertexReferences } from './vertexReferences';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

function matchesLegacy(shape: AnyShape) {
  for (const [fast, old] of [
    [shapeEdges(shape), shape.edges],
    [shapeFaces(shape), shape.faces],
  ]) {
    try {
      expect(fast).toHaveLength(old.length);
      expect(fast.every((item, i) => item.isSame(old[i]) && item.isEqual(old[i]))).toBe(true);
    } finally {
      [...fast, ...old].forEach((item) => item.delete());
    }
  }
}

it('keeps saved edge/face indices on a perforated solid, through translation and serialization', () => {
  const source = makeBox([0, 0, 0], [160, 160, 8]);
  const tools = Array.from({ length: 36 }, (_, i) =>
    (drawCircle(5).sketchOnPlane('XY') as Sketch)
      .extrude(12)
      .translate([15 + (i % 6) * 25, 15 + Math.floor(i / 6) * 25, -2]),
  );
  const cut = cutShapes(source, tools);
  try {
    matchesLegacy(cut);
    const body = bodyFromShape(makeBody(), cut, []);
    const saved = createShape({ ...body, origin: [723, -159, 92] });
    try {
      matchesLegacy(saved);
    } finally {
      saved.delete();
    }
  } finally {
    cut.delete();
    source.delete();
    tools.forEach((tool) => tool.delete());
  }
});

it('keeps independent coincident edges distinct while deduplicating shared topology', () => {
  const a = makeBox([0, 0, 0], [10, 20, 30]),
    b = makeBox([0, 0, 0], [10, 20, 30]);
  const compound = makeCompound([a, b]);
  try {
    matchesLegacy(compound);
    const edges = shapeEdges(compound);
    expect(edges).toHaveLength(24);
    edges.forEach((edge) => edge.delete());
  } finally {
    compound.delete();
    a.delete();
    b.delete();
  }
});

it('reference-only extraction preserves the same snap keys on solids and drawing curves', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([50, 30, 8]));
  const bodies = [
    makeBody(100, 200, 30, [1.25, -100.8, 3]),
    circle,
    { ...circle, curveSnaps: [0, 0.12, 0.55, 1] },
  ];
  for (const body of bodies) {
    const shape = createShape(body);
    try {
      const mesh = meshBody(body, shape),
        refs = shapeVertexReferences(body, shape);
      expect(refs).toHaveLength(mesh.verticesCAD.length);
      for (const vertex of mesh.verticesCAD) {
        const ref = refs.find((ref) => ref.key === vertex.anchor.key);
        expect(ref).toBeDefined();
        vertex.point.forEach((value, i) => expect(ref!.point[i]).toBeCloseTo(value, 8));
      }
      const converted = bodyFromShape(body, shape);
      for (const vertex of mesh.verticesCAD.filter(
        (vertex) => body.feature.type === 'rectangle-extrusion',
      ))
        expect(converted.vertexRefs?.[vertex.anchor.key]).toEqual(vertex.anchor.local);
    } finally {
      shape.delete();
    }
  }
});
