import { describe, expect, it } from 'vitest';
import { parseLength } from './units';
import { dimensionValue, freshProject, makeBody, parseProject } from './project';
import { History } from './history';
import { snapPoint } from './snap';
import { createSheet, projectPoint, recommendedScale } from '../drawing/svg';

describe('precision and model persistence', () => {
  it('migrates v3 parts to model purpose without changing their identity', () => {
    const body = makeBody(600, 400, 18),
      { purpose, ...old } = body;
    const restored = parseProject(JSON.stringify({ ...freshProject(), version: 3, bodies: [old] }));
    expect(restored.version).toBe(8);
    expect(restored.bodies[0]).toEqual(body);
  });
  it('accepts Finnish decimal units and rejects ambiguous or unsafe measurements', () => {
    expect(parseLength('2,4 m')).toBe(2400);
    expect(parseLength('18 mm')).toBe(18);
    expect(parseLength('1.8 cm')).toBe(18);
    expect(parseLength('-2,5', true)).toBe(-2.5);
    expect(parseLength('0', true, true)).toBe(0);
    expect(parseLength('', true, true)).toBe(0);
    expect(parseLength('   ', true, true)).toBe(0);
    expect(() => parseLength('')).toThrow();
    for (const bad of ['NaN', 'Infinity', '1e8', '3 apples', '1,2.3', '', '0', '-18', '100001'])
      expect(() => parseLength(bad)).toThrow();
  });
  it('round-trips exact geometry and IDs and rejects unknown versions, duplicate IDs and nonfinite coordinates', () => {
    const body = makeBody(600, 560, 18);
    const project = { ...freshProject(), bodies: [body] };
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(() => parseProject(JSON.stringify({ ...project, version: 999 }))).toThrow();
    expect(() => parseProject(JSON.stringify({ ...project, bodies: [body, body] }))).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...project, bodies: [{ ...body, origin: [null, 0, 0] }] })),
    ).toThrow();
  });
  it('dimensions follow feature edits and missing references stay broken', () => {
    const body = makeBody(),
      project = { ...freshProject(), bodies: [body] };
    const dimension = {
      id: 'd',
      bodyId: body.id,
      axis: 'x' as const,
      from: 'min' as const,
      to: 'max' as const,
    };
    expect(dimensionValue(project, dimension)).toBe(600);
    const resized = { ...project, bodies: [{ ...body, feature: { ...body.feature, width: 800 } }] };
    expect(dimensionValue(resized, dimension)).toBe(800);
    expect(dimensionValue({ ...project, bodies: [makeBody()] }, dimension)).toBeNull();
  });
  it('undo/redo restores a sequence and a new edit invalidates redo', () => {
    const initial = freshProject(),
      history = new History(initial);
    const rectangle = { ...initial, bodies: [makeBody()] };
    history.commit(rectangle);
    const solid = {
      ...rectangle,
      bodies: [{ ...rectangle.bodies[0], feature: { ...rectangle.bodies[0].feature, height: 18 } }],
    };
    history.commit(solid);
    expect(history.undo()).toEqual(rectangle);
    expect(history.undo()).toEqual(initial);
    expect(history.redo()).toEqual(rectangle);
    history.commit({ ...rectangle, name: 'Uusi haara' });
    expect(history.canRedo).toBe(false);
  });
});

describe('stable geometry snaps', () => {
  const body = makeBody(600, 400, 18);
  it('prefers a real vertex or edge midpoint over grid', () => {
    expect(snapPoint([597, 398, 0], [body], 10).point).toEqual([600, 400, 0]);
    expect(snapPoint([302, 1, 0], [body], 10).label).toBe('Keskipiste');
    expect(snapPoint([323, 147, 0], [body], 10).point).toEqual([320, 150, 0]);
  });
  it('holds a nearby snap until its release threshold and honours axis locks', () => {
    const previous = snapPoint([599, 400, 0], [body], 10);
    expect(snapPoint([588, 400, 0], [body], 10, previous).key).toBe(previous.key);
    expect(snapPoint([580, 400, 0], [body], 10, previous).key).not.toBe(previous.key);
    expect(snapPoint([599, 401, 0], [body], 10, undefined, 'x', [0, 20, 0]).point).toEqual([
      600, 20, 0,
    ]);
  });
});

describe('physical drawing scale', () => {
  it('600 mm at 1:5 is exactly 120 paper mm on an A4 SVG', () => {
    const body = makeBody(600, 400, 18),
      project = { ...freshProject(), name: '<script>unsafe</script>', bodies: [body] };
    const projection = {
      visible: ['M0 0L600 0L600 -18L0 -18Z'],
      hidden: [],
      viewBox: [0, -18, 600, 18] as [number, number, number, number],
    };
    const { svg, fits } = createSheet(project, projection, 'front', 5);
    expect(svg).toContain('width="297mm" height="210mm" viewBox="0 0 297 210"');
    expect(svg).toContain('scale(0.2)');
    expect(600 * 0.2).toBe(120);
    expect(fits).toBe(true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(createSheet(project, projection, 'front', 1).fits).toBe(false);
    expect(recommendedScale(project, 'front')).toBe(5);
  });
  it('maps each orthographic view without measuring from screen pixels', () => {
    expect(projectPoint([100, 200, 300], 'front')).toEqual([100, -300]);
    expect(projectPoint([100, 200, 300], 'right')).toEqual([200, -300]);
    expect(projectPoint([100, 200, 300], 'top')).toEqual([100, -200]);
  });
});
