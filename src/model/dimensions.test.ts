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
