import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import { makeBody, makeProfileBody, parseProject, freshProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, pushPullFace } from './kernel';
import { booleanBodies, splitFace, offsetFace } from './operations';
import { resolveAnchor } from '../model/guides';
import { applyBoolean } from '../model/operations';
import { measureFaceSpan } from './measurement';
import { distanceToSize, extrusionDistance, transferExtrusionValue } from '../model/extrusion';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
function volume(body: Body) {
  const shape = createShape(body);
  try {
    return measureVolume(shape.asShape3D());
  } finally {
    shape.delete();
  }
}
describe('face regions and exact boolean modelling', () => {
  it('insets every box face by 18 mm and cuts exact pockets and through openings', () => {
    const box = makeBody(600, 600, 2400);
    for (const axis of ['x', 'y', 'z'] as const)
      for (const side of ['min', 'max'] as const) {
        const split = offsetFace(box, `${axis}:${side}`, 18);
        expect(volume(split.body)).toBeCloseTo(600 * 600 * 2400, 2);
        const depth = axis === 'z' ? 2400 : 600;
        const area = axis === 'z' ? 564 * 564 : 564 * 2364;
        const pocket = pushPullFace(split.body, split.face, -(depth - 18));
        expect(volume(pocket)).toBeCloseTo(volume(box) - area * (depth - 18), 2);
        const through = pushPullFace(split.body, split.face, -depth - 50);
        expect(volume(through)).toBeCloseTo(volume(box) - area * depth, 2);
        expect(volume(pushPullFace(split.body, split.face, -depth))).toBeCloseTo(
          volume(through),
          2,
        );
        expect(
          parseProject(JSON.stringify({ ...freshProject(), bodies: [through] })).bodies[0],
        ).toEqual(through);
      }
    expect(() => offsetFace(box, 'y:min', 301)).toThrow();
    expect(() => offsetFace({ ...box, locked: true }, 'y:min', 18)).toThrow('kiinnitetty');
    expect(volume(box)).toBeCloseTo(864000000, 2);
  });
  it('offsets circular and oblique polygon faces with exact geometry', () => {
    const circle = makeProfileBody({ kind: 'circle', radius: 50 }, sketchFrame([0, 0, 0]), 20);
    const shape = createShape(circle);
    const top = meshBody(circle, shape).faces.find((f) => f.normal[2] > 0.99)!;
    shape.delete();
    const split = offsetFace(circle, top.ref, 5);
    expect(volume(pushPullFace(split.body, split.face, -30))).toBeCloseTo(
      Math.PI * (2500 - 2025) * 20,
      3,
    );
    const normal: [number, number, number] = [0, 0.6, 0.8];
    const plate = makeProfileBody(
      { kind: 'rectangle', width: 100, depth: 80 },
      sketchFrame([10, 20, 30], normal),
      18,
    );
    const ps = createShape(plate);
    const cap = meshBody(plate, ps).faces.find(
      (f) => f.planar && f.normal.every((n, i) => Math.abs(n - normal[i]) < 1e-6),
    )!;
    ps.delete();
    const inset = offsetFace(plate, cap.ref, 5);
    expect(volume(pushPullFace(inset.body, inset.face, -25))).toBeCloseTo((8000 - 90 * 70) * 18, 3);
  });
  it('keeps the inset distance around an existing hole as well as the outer boundary', () => {
    const plate = makeBody(100, 100, 20);
    const holed = booleanBodies(
      [plate],
      [makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 50, -5]), 30)],
      'cut',
    )[0];
    const shape = createShape(holed);
    const face = meshBody(holed, shape).faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    shape.delete();
    const inset = offsetFace(holed, face.ref, 5);
    const pocket = pushPullFace(inset.body, inset.face, -10);
    expect(volume(pocket)).toBeCloseTo(volume(holed) - (90 * 90 - Math.PI * 15 * 15) * 10, 3);
  });
  it('changes 652 mm to an exact target from all six sides, keeping the opposite side fixed', () => {
    const body = makeBody(652, 652, 652, [20, -30, 40]);
    for (const axis of ['x', 'y', 'z'] as const)
      for (const end of ['min', 'max'] as const) {
        const ref = `${axis}:${end}` as const,
          span = measureFaceSpan(body, ref);
        expect(span.depth).toBeCloseTo(652, 7);
        for (const size of [150, 550, 750]) {
          const changed = pushPullFace(
            body,
            ref,
            distanceToSize(String(size), span.depth, true, 1),
          );
          expect(measureFaceSpan(changed, ref).depth).toBeCloseTo(size, 7);
          const i = ['x', 'y', 'z'].indexOf(axis);
          expect(changed.origin[i]).toBeCloseTo(
            body.origin[i] + (end === 'min' ? 652 - size : 0),
            7,
          );
        }
      }
  });
  it('measures the local remaining wall after a pocket and ignores separated solids behind it', () => {
    const plate = makeBody(100, 100, 20);
    const split = splitFace(
      plate,
      'z:max',
      makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 50, 20])),
    );
    const pocket = pushPullFace(split.body, split.face, -8),
      shape = createShape(pocket);
    let floor;
    try {
      floor = meshBody(pocket, shape).faces.find(
        (f) => f.planar && f.normal[2] > 0.99 && Math.abs(f.center[2] - 12) < 1e-5,
      )!;
    } finally {
      shape.delete();
    }
    const span = measureFaceSpan(pocket, floor.ref, [50, 50, 12]);
    expect(span.depth).toBeCloseTo(12, 7);
    const remaining = pushPullFace(pocket, floor.ref, distanceToSize('5', span.depth, true, 1));
    expect(volume(remaining)).toBeCloseTo(200000 - Math.PI * 100 * 15, 4);
    const compound = booleanBodies([plate], [makeBody(100, 100, 20, [0, 0, -80])], 'join')[0];
    const compoundShape = createShape(compound);
    let top;
    try {
      top = meshBody(compound, compoundShape).faces.find(
        (f) => f.planar && f.normal[2] > 0.99 && Math.abs(f.center[2] - 20) < 1e-5,
      )!;
    } finally {
      compoundShape.delete();
    }
    expect(measureFaceSpan(compound, top.ref, [50, 50, 20]).depth).toBeCloseTo(20, 7);
  });
  it('measures oblique thickness exactly and finds material when the face centre is in a hole', () => {
    const normal: [number, number, number] = [0, Math.SQRT1_2, Math.SQRT1_2];
    const plate = makeProfileBody(
      { kind: 'rectangle', width: 100, depth: 80 },
      sketchFrame([10, 20, 30], normal),
      18,
    );
    const shape = createShape(plate);
    let top;
    try {
      top = meshBody(plate, shape).faces.find(
        (f) => f.planar && f.normal.every((n, i) => Math.abs(n - normal[i]) < 1e-6),
      )!;
    } finally {
      shape.delete();
    }
    expect(measureFaceSpan(plate, top.ref).depth).toBeCloseTo(18, 7);
    const changed = pushPullFace(plate, top.ref, -13);
    expect(volume(changed)).toBeCloseTo(100 * 80 * 5, 4);
    const holed = booleanBodies(
      [makeBody(100, 100, 20)],
      [makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 50, -10]), 40)],
      'cut',
    )[0];
    const hs = createShape(holed);
    let cap;
    try {
      cap = meshBody(holed, hs).faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    } finally {
      hs.delete();
    }
    expect(measureFaceSpan(holed, cap.ref).depth).toBeCloseTo(20, 7);
    expect(() => measureFaceSpan(holed, cap.ref, [50, 50, 20])).toThrow('vastapintaa');
    expect(measureFaceSpan(makeBody(100, 100, 0), 'z:max').depth).toBe(0);
  });
  it('uses drag direction for unsigned values and changes the meaning of a preserved Tab value', () => {
    expect(extrusionDistance('150', -1)).toBe(-150);
    expect(extrusionDistance('+150', -1)).toBe(150);
    expect(extrusionDistance('-150', 1)).toBe(-150);
    expect(distanceToSize(transferExtrusionValue('-15 cm', 'remaining'), 652, true, -1)).toBe(-502);
    expect(distanceToSize('750', 652, true, -1)).toBe(98);
    expect(distanceToSize('550', 550, true, 1)).toBe(0);
    expect(distanceToSize('18', 0, false, -1)).toBe(-18);
    expect(() => distanceToSize('-150', 652, true, 1)).toThrow('positiivinen');
    expect(distanceToSize('0', 652, true, 1)).toBe(-652);
  });
  it('rejects an edge anchor in a removed segment while preserving an untouched edge segment', () => {
    const plate = makeBody(100, 100, 20),
      edge = {
        from: { bodyId: plate.id, key: 'corner:0', local: [0, 0, 0] as [number, number, number] },
        to: { bodyId: plate.id, key: 'corner:4', local: [100, 0, 0] as [number, number, number] },
        t: 0.5,
      };
    const cut = booleanBodies([plate], [makeBody(20, 20, 40, [40, -10, -10])], 'cut')[0];
    expect(resolveAnchor([cut], edge.from)).toEqual([0, 0, 0]);
    expect(resolveAnchor([cut], edge.to)).toEqual([100, 0, 0]);
    expect(resolveAnchor([cut], { edge })).toBeUndefined();
    expect(resolveAnchor([cut], { edge: { ...edge, t: 0.2 } })).toEqual([20, 0, 0]);
  });
  it('transfers surviving tool anchors when Join consumes the tool and keeps references after reload', () => {
    const a = makeBody(100, 100, 20),
      b = makeBody(100, 100, 20, [50, 0, 0]);
    const before = {
      ...freshProject(),
      bodies: [a, b],
      guides: [
        {
          id: 'joined-guide',
          mode: 'guide' as const,
          anchor: { bodyId: b.id, key: 'corner:4', local: [100, 0, 0] as [number, number, number] },
          plane: 'XY' as const,
          angle: 0,
          length: 100,
        },
      ],
    };
    const next = applyBoolean(
        before,
        [a.id],
        [b.id],
        booleanBodies([a], [b], 'join'),
        'join',
        false,
      ),
      restored = parseProject(JSON.stringify(next));
    expect(restored.guides[0].anchor).toMatchObject({ bodyId: a.id });
    expect(resolveAnchor(restored.bodies, restored.guides[0].anchor)).toEqual([150, 0, 0]);
  });
  it('splits a circular region without changing volume, then cuts a blind pocket and a through hole', () => {
    const plate = makeBody(100, 100, 20),
      circle = makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 50, 20]));
    const result = splitFace(plate, 'z:max', circle),
      shape = createShape(result.body);
    try {
      expect(meshBody(result.body, shape).faces).toHaveLength(7);
    } finally {
      shape.delete();
    }
    expect(volume(result.body)).toBeCloseTo(200000, 5);
    expect(volume(pushPullFace(result.body, result.face, -5))).toBeCloseTo(
      200000 - Math.PI * 100 * 5,
      4,
    );
    const through = pushPullFace(result.body, result.face, -30);
    expect(volume(through)).toBeCloseTo(200000 - Math.PI * 100 * 20, 4);
    expect(
      parseProject(JSON.stringify({ ...freshProject(), bodies: [through] })).bodies[0],
    ).toEqual(through);
  });
  it('makes rectangular and irregular regions on a vertical face, including an outward boss', () => {
    const wall = makeBody(100, 20, 100);
    for (const profile of [
      { kind: 'rectangle' as const, width: 20, depth: 30 },
      {
        kind: 'polygon' as const,
        points: [
          [0, 0],
          [20, 0],
          [10, 30],
        ] as [number, number][],
      },
    ]) {
      const sketch = makeProfileBody(profile, sketchFrame([30, 0, 30], [0, -1, 0]));
      const region = splitFace(wall, 'y:min', sketch),
        area = profile.kind === 'rectangle' ? 600 : 300;
      expect(volume(pushPullFace(region.body, region.face, 10))).toBeCloseTo(200000 + area * 10, 4);
    }
  });
  it('cuts several targets with several tools and supports reversing the two sets', () => {
    const targets = [makeBody(100, 100, 20), makeBody(100, 100, 20, [0, 0, 40])];
    const cutters = [25, 75].map((x) =>
      makeProfileBody({ kind: 'circle', radius: 5 }, sketchFrame([x, 50, -10]), 80),
    );
    const results = booleanBodies(targets, cutters, 'cut');
    expect(results).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(results[i].id).toBe(targets[i].id);
      expect(volume(results[i])).toBeCloseTo(200000 - 2 * Math.PI * 25 * 20, 4);
    }
    const inverse = booleanBodies(cutters, targets, 'cut');
    expect(inverse).toHaveLength(2);
    for (const body of inverse) expect(volume(body)).toBeCloseTo(Math.PI * 25 * 40, 4);
    expect(volume(targets[0])).toBeCloseTo(200000, 5);
  });
  it('joins overlapping solids, leaves disjoint cuts unchanged, and detects consumed targets', () => {
    const a = makeBody(100, 100, 20),
      b = makeBody(100, 100, 20, [50, 0, 0]);
    expect(volume(booleanBodies([a], [b], 'join')[0])).toBeCloseTo(300000, 5);
    expect(booleanBodies([a], [makeBody(10, 10, 10, [200, 0, 0])], 'cut')[0]).toBe(a);
    expect(booleanBodies([a], [makeBody(200, 200, 40, [-10, -10, -10])], 'cut')).toEqual([]);
    expect(() => booleanBodies([a], [a], 'cut')).toThrow('yhtä aikaa');
    expect(() => booleanBodies([a], [makeBody()], 'cut')).toThrow('paksuus');
  });
  it('keeps exact curved bounds on oblique ellipses and round trips a boolean result', () => {
    const ellipse = makeProfileBody(
      { kind: 'ellipse', radiusX: 10, radiusY: 20 },
      sketchFrame([20, 30, 40], [0, Math.SQRT1_2, Math.SQRT1_2]),
      15,
    );
    expect(volume(ellipse)).toBeCloseTo(Math.PI * 10 * 20 * 15, 4);
    const other = makeBody(10, 10, 10, [500, 0, 0]);
    const joined = booleanBodies([ellipse], [other], 'join')[0];
    expect(volume(joined)).toBeCloseTo(Math.PI * 10 * 20 * 15 + 1000, 4);
    expect(joined.feature.width).toBeCloseTo(500, 5);
  });
  it('keeps an unchanged semantic corner anchor through a split and removes cut-away anchors', () => {
    const plate = makeBody(100, 100, 20),
      anchor = { bodyId: plate.id, key: 'corner:0', local: [0, 0, 0] as [number, number, number] };
    const region = splitFace(
      plate,
      'z:max',
      makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([50, 50, 20])),
    );
    expect(resolveAnchor([region.body], anchor)).toEqual([0, 0, 0]);
    const cut = booleanBodies([region.body], [makeBody(20, 20, 40, [-10, -10, -10])], 'cut')[0];
    expect(resolveAnchor([cut], anchor)).toBeUndefined();
  });
});
