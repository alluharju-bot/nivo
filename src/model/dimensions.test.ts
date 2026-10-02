import { dimensionValue, type PointDimension } from './project';
import { pointDimensionGeometry, pointDimensionInView } from './dimensions';
import { translateSelection } from './groups';
import { describe, expect, it } from 'vitest';
import { addBodyDimensions } from './dimensions';
import { freshProject, makeBody, parseProject } from './project';
import { createSheet, recommendedScale } from '../drawing/svg';

describe('shared model dimensions', () => {
  it('adds dimensions once, skips zero thickness and construction, and migrates visibility defaults', () => {
    const solid = makeBody(600, 400, 18),
      flat = makeBody(100, 50, 0);
    const guide = { ...makeBody(), purpose: 'construction' as const };
    const source = { ...freshProject(), bodies: [solid, flat, guide] };
    const ids = source.bodies.map((b) => b.id);
    const project = addBodyDimensions(source, ids);
    expect(project.dimensions).toHaveLength(5);
    expect(source.dimensions).toHaveLength(0);
    expect(addBodyDimensions(project, ids).dimensions).toEqual(project.dimensions);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const { dimensionDisplay, ...settings } = project.settings;
    expect(parseProject(JSON.stringify({ ...project, settings })).settings.dimensionDisplay).toBe(
      'all',
    );
  });
  it('places more than three overlapping dimensions on separate printed lines, with room for all annotations', () => {
    const bodies = Array.from({ length: 5 }, (_, i) => makeBody(300, 200, 18, [0, i * 220, 0]));
    const project = addBodyDimensions(
      { ...freshProject(), bodies },
      bodies.map((b) => b.id),
      ['x'],
    );
    const projection = {
      visible: [],
      hidden: [],
      viewBox: [0, -18, 300, 18] as [number, number, number, number],
    };
    const sheet = createSheet(project, projection, 'front', 5);
    const heights = [...sheet.svg.matchAll(/<text [^>]*x="[^"]+" y="([^"]+)">300<\/text>/g)].map(
      (m) => Number(m[1]),
    );
    expect(heights).toHaveLength(5);
    expect(new Set(heights).size).toBe(5);
    expect(Math.max(...heights)).toBeLessThan(175);
    expect(sheet.fits).toBe(true);
    expect(sheet.orphanCount).toBe(0);
    expect(recommendedScale(project, 'front')).toBe(2);
  });
  it('rejects overflowing annotation stacks and continues reporting missing references', () => {
    const bodies = Array.from({ length: 24 }, () => makeBody(300, 200, 18));
    const project = addBodyDimensions(
      { ...freshProject(), bodies },
      bodies.map((b) => b.id),
      ['x'],
    );
    const projection = {
      visible: [],
      hidden: [],
      viewBox: [0, -18, 300, 18] as [number, number, number, number],
    };
    expect(createSheet(project, projection, 'front', 1000).fits).toBe(false);
    expect(
      createSheet({ ...project, bodies: bodies.slice(1) }, projection, 'front', 1000).orphanCount,
    ).toBe(1);
  });
});

it('tracks two anchors across objects, reports missing references and omits foreshortened views', () => {
  const a = makeBody(100, 100, 20),
    b = makeBody(100, 100, 20, [137, 0, 0]);
  const d: PointDimension = {
    id: 'gap',
    kind: 'points',
    start: { bodyId: a.id, key: 'corner:5', local: [100, 0, 20] },
    end: { bodyId: b.id, key: 'corner:1', local: [0, 0, 20] },
    fallback: [
      [100, 0, 20],
      [137, 0, 20],
    ],
    axis: 'distance',
    offset: [0, -40, 0],
    normal: [0, 0, 1],
  };
  let p = { ...freshProject(), bodies: [a, b], dimensions: [d] };
  expect(dimensionValue(p, d)).toBe(37);
  expect(pointDimensionInView(p.bodies, d, 'top')).toBe(true);
  expect(pointDimensionInView(p.bodies, d, 'front')).toBe(false);
  p = { ...p, bodies: [a, { ...b, origin: [167, 0, 0] }] };
  expect(dimensionValue(p, d)).toBe(67);
  const copied = translateSelection(p, [a.id, b.id], [500, 100, 0], true).project;
  expect(copied.dimensions).toHaveLength(2);
  expect(dimensionValue(copied, copied.dimensions[1])).toBe(67);
  expect(dimensionValue({ ...p, bodies: [a] }, d)).toBeNull();
  expect(pointDimensionGeometry([a], d).orphan).toBe(true);
  const diagonal: PointDimension = {
    ...d,
    end: { point: [200, 80, 60] },
    axis: 'distance' as const,
  };
  expect(pointDimensionInView([a], diagonal, 'top')).toBe(false);
  expect(dimensionValue({ ...p, dimensions: [diagonal] }, diagonal)).toBeCloseTo(
    Math.hypot(100, 80, 40),
  );
  expect(dimensionValue(p, { ...diagonal, axis: 'x' })).toBe(100);
});
it('reserves paper space for a dimension placed far outside the model', () => {
  const body = makeBody(100, 100, 20),
    d: PointDimension = {
      id: 'far',
      kind: 'points',
      start: { point: [0, 0, 20] },
      end: { point: [100, 0, 20] },
      fallback: [
        [0, 0, 20],
        [100, 0, 20],
      ],
      axis: 'distance',
      offset: [0, -900, 0],
      normal: [0, 0, 1],
    },
    p = { ...freshProject(), bodies: [body], dimensions: [d] };
  expect(recommendedScale(p, 'top')).toBeGreaterThanOrEqual(10);
  expect(
    createSheet(p, { visible: [], hidden: [], viewBox: [0, -100, 100, 100] }, 'top', 1).fits,
  ).toBe(false);
  expect(
    createSheet(p, { visible: [], hidden: [], viewBox: [0, -100, 100, 100] }, 'top', 10).fits,
  ).toBe(true);
});
