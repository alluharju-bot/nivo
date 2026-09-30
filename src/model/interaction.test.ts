import { describe, expect, it } from 'vitest';
import {
  makeBody,
  makePolygonBody,
  mergeBodies,
  freshProject,
  parseProject,
  type Guide,
} from './project';
import { angleBetween, guidePoints, resolveAnchor } from './guides';
import { polygonArea, polygonError } from './polygon';
import { snapPoint } from './snap';

describe('editable objects and migration', () => {
  it('keeps originals independent and combines a flattened, exact source recipe', () => {
    const a = makeBody(100, 100, 20),
      b = makeBody(100, 100, 20, [50, 0, 0]);
    const union = mergeBodies([a, b]);
    expect(union.feature.type).toBe('union');
    expect(union.feature.width).toBe(150);
    expect(a.feature.width).toBe(100);
    expect(union.id).not.toBe(a.id);
    const saved = { ...freshProject(), bodies: [union] };
    expect(parseProject(JSON.stringify(saved))).toEqual(saved);
    expect(() => mergeBodies([a, makeBody()])).toThrow();
  });
  it('migrates original v1 projects without losing body identifiers', () => {
    const current = { ...freshProject(), bodies: [makeBody()] };
    const { guides, ...legacy } = current;
    const result = parseProject(JSON.stringify({ ...legacy, version: 1 }));
    expect(result.version).toBe(3);
    expect(result.bodies).toEqual(current.bodies);
    expect(result.guides).toEqual([]);
  });
});
describe('pen geometry', () => {
  it('validates imported vertical face extents and coplanarity before replacing a project', () => {
    const body = makePolygonBody([
      [0, 0, 0],
      [200, 0, 0],
      [200, 0, 150],
      [0, 0, 150],
    ]);
    const project = { ...freshProject(), bodies: [body] };
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(() =>
      parseProject(
        JSON.stringify({
          ...project,
          bodies: [{ ...body, feature: { ...body.feature, height: 140 } }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProject(
        JSON.stringify({
          ...project,
          bodies: [
            {
              ...body,
              feature: {
                ...body.feature,
                depth: 10,
                points: [
                  [0, 0, 0],
                  [200, 0, 0],
                  [200, 10, 150],
                  [0, 0, 150],
                ],
              },
            },
          ],
        }),
      ),
    ).toThrow();
  });
  it('accepts a concave polygon and rejects crossing or degenerate outlines', () => {
    const polygon = makePolygonBody([
      [0, 0, 0],
      [100, 0, 0],
      [100, 40, 0],
      [40, 40, 0],
      [40, 100, 0],
      [0, 100, 0],
    ]);
    expect(polygon.feature.type).toBe('polygon-extrusion');
    expect(
      polygonArea([
        [0, 0],
        [100, 0],
        [100, 40],
        [40, 40],
        [40, 100],
        [0, 100],
      ]),
    ).toBe(6400);
    expect(
      polygonError([
        [0, 0],
        [100, 100],
        [0, 100],
        [100, 0],
      ]),
    ).toContain('leikkaavat');
    expect(
      polygonError([
        [0, 0],
        [50, 0],
        [100, 0],
      ]),
    ).toBeDefined();
  });
});
describe('guides and acquired references', () => {
  it('keeps an edge guide parallel and anchored when a box moves and changes width', () => {
    const body = makeBody(100, 100, 20);
    const guide: Guide = {
      id: 'edge',
      mode: 'guide',
      anchor: {
        edge: {
          from: { bodyId: body.id, key: 'corner:0', local: [0, 0, 0] },
          to: { bodyId: body.id, key: 'corner:4', local: [100, 0, 0] },
          t: 0.25,
        },
      },
      direction: [1, 0, 0],
      offset: [0, 40, 0],
      length: 100,
      angle: 0,
      plane: 'XY',
      xray: true,
    };
    const changed = {
      ...body,
      origin: [20, 30, 0] as [number, number, number],
      feature: { ...body.feature, width: 200 },
    };
    expect(guidePoints([body], guide)).toEqual([
      [25, 40, 0],
      [125, 40, 0],
    ]);
    expect(guidePoints([changed], guide)).toEqual([
      [70, 70, 0],
      [170, 70, 0],
    ]);
    expect(
      parseProject(JSON.stringify({ ...freshProject(), bodies: [changed], guides: [guide] }))
        .guides[0].xray,
    ).toBe(true);
  });
  const body = makeBody(100, 100, 20);
  const guide: Guide = {
    id: 'g',
    mode: 'guide',
    anchor: { bodyId: body.id, key: 'corner:0', local: [0, 0, 0] },
    plane: 'XY',
    angle: 45,
    length: 100,
  };
  it('anchors a guide to a semantic vertex and follows body movement', () => {
    expect(guidePoints([body], guide)?.[0]).toEqual([0, 0, 0]);
    expect(guidePoints([{ ...body, origin: [20, 40, 60] }], guide)?.[0]).toEqual([20, 40, 60]);
    expect(guidePoints([], guide)).toBeUndefined();
    expect(angleBetween([0, 0, 0], [100, 30, 0], 'XY')).toBe(0);
    expect(angleBetween([0, 0, 0], [100, 30, 0], 'XY', true)).toBeCloseTo(16.6992, 3);
  });
  it('snaps to the extension of a construction line but not a measurement line', () => {
    const result = snapPoint([150, 153, 0], [body], 8, undefined, undefined, undefined, false, {
      guides: [guide],
    });
    expect(result.label).toBe('Apuviiva');
    expect(result.point[0]).toBeCloseTo(result.point[1]);
    expect(
      snapPoint([150, 153, 0], [body], 8, undefined, undefined, undefined, false, {
        guides: [{ ...guide, mode: 'free' }],
      }).label,
    ).toBe('Vapaa');
  });
  it('projects an acquired 3D midpoint into the drawing plane and locks only the nearby coordinate', () => {
    const result = snapPoint([49, 210, 0], [], 8, undefined, undefined, undefined, false, {
      reference: { point: [50, 50, 10], key: 'center', label: 'Keskipiste' },
    });
    expect(result.point).toEqual([50, 210, 0]);
    expect(result.label).toContain('Viite');
    expect(resolveAnchor([body], { point: [1, 2, 3] })).toEqual([1, 2, 3]);
  });
  it('keeps a Shift direction constraint even with a nearby off-axis vertex', () => {
    const nearby = makeBody(20, 20, 10, [100, 2, 0]);
    const snap = snapPoint([101, 9, 0], [nearby], 12, undefined, undefined, undefined, true, {
      inferenceOrigin: [0, 0, 0],
      forceDirection: true,
    });
    expect(snap.point[1]).toBe(0);
    expect(snap.label).toContain('Suunta');
  });
});
