import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import { makeBody, makeProfileBody, parseProject, freshProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { createShape, meshBody, pushPullFace } from './kernel';
import { booleanBodies, splitFace } from './operations';
import { resolveAnchor } from '../model/guides';
import { applyBoolean } from '../model/operations';
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
