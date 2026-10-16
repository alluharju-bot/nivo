import { expect, test } from 'vitest';
import { dimensionLabelBounds, dimensionPaths, dimensionSvg } from './dimensionGraphics';
import { freshProject, makeBody, parseProject, pointDimensionSchema } from '../model/project';
import { createSheet } from './svg';

test('drafting lines retain solid ends, interrupted centres and continuous picking geometry', () => {
  const paths = dimensionPaths([0, 0], [100, 0], [0, 60], [100, 60]);
  expect(paths.solid).toContain('M0 2L0 10');
  expect(paths.solid).toContain('M0 53L0 65');
  expect(paths.dashed).toBe('M0 10L0 53 M100 10L100 53');
  expect(paths.hit).toContain('M0 2L0 65');
  expect(dimensionPaths([0, 0], [100, 0], [0, 60], [100, 60], 'solid').dashed).toBe('');
  expect(dimensionPaths([0, 0], [100, 0], [0, 5], [100, 5]).dashed).toBe('');
  for (const points of [
    [
      [0, 0],
      [0, 100],
      [-60, 0],
      [-60, 100],
    ],
    [
      [100, 0],
      [0, 0],
      [100, -60],
      [0, -60],
    ],
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ]) {
    const result = dimensionPaths(points[0], points[1], points[2], points[3]);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  }
});

test('screen and paper labels default to horizontal regardless of dimension direction', () => {
  const svg = dimensionSvg([0, 0], [0, 100], [60, 0], [60, 100], '100', 3);
  expect(svg).toContain('rotate(0)');
  expect(svg).toContain('class="dimension-extension"');
  const vertical = dimensionLabelBounds(30, 90),
    horizontal = dimensionLabelBounds(30, 0);
  expect(vertical.height).toBeCloseTo(horizontal.width);
  expect(vertical.width).toBeCloseTo(horizontal.height);
});

test('rotation and line style persist across import and drawing export without changing measurement', () => {
  const body = makeBody(600, 400, 20);
  const source = {
    ...freshProject(),
    bodies: [body],
    dimensions: [
      {
        id: 'p',
        kind: 'points',
        start: { point: [0, 0, 20] },
        end: { point: [0, 400, 20] },
        fallback: [
          [0, 0, 20],
          [0, 400, 20],
        ],
        axis: 'distance',
        offset: [-100, 0, 0],
        normal: [0, 0, 1],
        labelRotation: 22.5,
      },
    ],
  };
  const project = parseProject(JSON.stringify(source));
  const projection = {
    visible: [],
    hidden: [],
    viewBox: [0, -400, 600, 400] as [number, number, number, number],
  };
  const sheet = createSheet(project, projection, 'top', 5);
  expect(sheet.svg).toContain('rotate(22.5)');
  expect(sheet.svg).toContain('data-mm="400"');
  expect(sheet.svg).toContain('class="dimension-extension"');
  project.settings.dimensionLineStyle = 'solid';
  const loaded = parseProject(JSON.stringify(project));
  expect(loaded.settings.dimensionLineStyle).toBe('solid');
  expect(createSheet(loaded, projection, 'top', 5).svg).not.toContain(
    'class="dimension-extension"',
  );
  expect(
    pointDimensionSchema.safeParse({ ...source.dimensions[0], labelRotation: 361 }).success,
  ).toBe(false);
});
