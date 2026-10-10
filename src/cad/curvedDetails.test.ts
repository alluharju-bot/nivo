import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, draw, type Sketch } from 'replicad';
import { makeBody, makeProfileBody } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, bodyFromShape, meshBody, shapeIsValid } from './kernel';
import { detailEdges } from './details';
import { booleanBodies } from './operations';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
function capsule() {
  const sketch = draw([-10, -25])
    .lineTo([-10, 25])
    .threePointsArcTo([10, 25], [0, 35])
    .lineTo([10, -25])
    .threePointsArcTo([-10, -25], [0, -35])
    .close()
    .sketchOnPlane('XY') as Sketch;
  const shape = sketch.extrude(20);
  try {
    return bodyFromShape(makeBody(), shape, []);
  } finally {
    shape.delete();
  }
}
const bodies = {
  cylinder: () => makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([0, 0, 0]), 20),
  ellipse: () =>
    makeProfileBody({ kind: 'ellipse', radiusX: 40, radiusY: 20 }, sketchFrame([0, 0, 0]), 20),
  capsule,
  capsuleHole: () => booleanBodies([makeBody(100, 100, 20, [-50, -50, 0])], [capsule()], 'cut')[0],
  curvedWallOpening: () => {
    const outer = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([0, 0, 0]), 100);
    const inner = makeProfileBody({ kind: 'circle', radius: 35 }, sketchFrame([0, 0, -1]), 102);
    const tube = booleanBodies([outer], [inner], 'cut')[0];
    const sketch = draw([-5, -15])
      .lineTo([-5, 15])
      .threePointsArcTo([5, 15], [0, 20])
      .lineTo([5, -15])
      .threePointsArcTo([-5, -15], [0, -20])
      .close()
      .sketchOnPlane('XZ') as Sketch;
    const shape = sketch.extrude(100).translate([0, 50, 50]);
    try {
      return booleanBodies([tube], [bodyFromShape(makeBody(), shape, [])], 'cut')[0];
    } finally {
      shape.delete();
    }
  },
};
for (const [name, create] of Object.entries(bodies)) {
  it.each(['fillet', 'chamfer'] as const)(
    `${name}: all eligible curved and straight edges accept %s`,
    (operation) => {
      const body = create();
      const shape = createShape(body);
      const mesh = meshBody(body, shape);
      shape.delete();
      const result = detailEdges(
        body,
        mesh.detailEdges!.map((e) => e.index),
        operation,
        1,
      );
      expect(result.mesh.volume).toBeGreaterThan(0);
      expect(result.mesh.volume).not.toBeCloseTo(mesh.volume, 3);
      const restored = createShape(result.body);
      try {
        expect(shapeIsValid(restored)).toBe(true);
      } finally {
        restored.delete();
      }
    },
  );
}

it('offers circular rims, but never the seam down the smooth side of a cylinder', () => {
  const body = bodies.cylinder(),
    shape = createShape(body),
    edges = shape.edges;
  try {
    const mesh = meshBody(body, shape);
    expect(mesh.detailEdges!.length).toBeGreaterThan(0);
    expect(mesh.detailEdges!.every((e) => edges[e.index].geomType === 'CIRCLE')).toBe(true);
    const seam = edges.findIndex((e) => e.geomType === 'LINE');
    expect(seam).toBeGreaterThanOrEqual(0);
    expect(() => detailEdges(body, [seam], 'fillet', 1)).toThrow('Sileän pinnan');
  } finally {
    edges.forEach((e) => e.delete());
    shape.delete();
  }
});

it('does not offer the tangent joins between a capsule’s flat and semicircular sides', () => {
  const body = capsule(),
    shape = createShape(body);
  try {
    const edges = meshBody(body, shape).detailEdges!;
    expect(edges).toHaveLength(8);
    expect(
      edges.every((e) =>
        [0, 20].some((z) => e.lines.every((v, i) => i % 3 !== 2 || Math.abs(v - z) < 1e-6)),
      ),
    ).toBe(true);
  } finally {
    shape.delete();
  }
});
