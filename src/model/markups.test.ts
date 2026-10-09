import { expect, test } from 'vitest';
import { areaUnion, notePosition, noteTarget, type AreaRect } from './markups';
import {
  freshProject,
  makeBody,
  parseProject,
  areaMarkupSchema,
  noteMarkupSchema,
} from './project';
import { referenceAnchor } from './guides';
import { sketchFrame } from './sketch';
import { markupSvg } from '../viewport/markupSvg';
import { createSheet } from '../drawing/svg';
import { shareProjectData } from './sharing';

test('overlapping, duplicate and contained rectangles count once with no internal seam', () => {
  const rects: AreaRect[] = [
    [0, 0, 1000, 1000],
    [500, 0, 1500, 1000],
    [0, 0, 1000, 1000],
    [100, 100, 200, 200],
  ];
  const union = areaUnion(rects);
  expect(union.area).toBe(1_500_000);
  expect(union.center).toEqual([750, 500]);
  expect(union.edges.reduce((sum, [x, y, r, b]) => sum + Math.hypot(r - x, b - y), 0)).toBe(5000);
  expect(areaUnion([...rects].reverse())).toEqual(union);
});
test('union preserves a hole, disconnected islands, negative coordinates and touching boundaries', () => {
  const rects: AreaRect[] = [
    [-3, -3, 3, -2],
    [-3, 2, 3, 3],
    [-3, -2, -2, 2],
    [2, -2, 3, 2],
    [10, 10, 11, 11],
  ];
  const union = areaUnion(rects);
  expect(union.area).toBe(21);
  expect(union.cells.some(([x, y, r, b]) => x < 0 && r > 0 && y < 0 && b > 0)).toBe(false);
  expect(union.edges.reduce((sum, [x, y, r, b]) => sum + Math.hypot(r - x, b - y), 0)).toBe(44);
  expect(areaUnion([]).area).toBe(0);
});
test('a note follows its referenced part, retaining an explicit fallback if the part disappears', () => {
  const body = makeBody(600, 400, 20);
  const note = noteMarkupSchema.parse({
    id: 'n',
    kind: 'note',
    text: 'Lista',
    anchor: referenceAnchor(body, [600, 400, 20]),
    fallback: [600, 400, 20],
    offset: [50, 50, 0],
  });
  expect(notePosition(note, [body])).toEqual([650, 450, 20]);
  const moved = { ...body, origin: [100, 200, 300] as [number, number, number] };
  expect(noteTarget(note, [moved])).toEqual([700, 600, 320]);
  expect(notePosition(note, [moved])).toEqual([750, 650, 320]);
  expect(noteTarget(note, [])).toEqual(note.fallback);
});
test('markups round trip without changing geometry, export safely and honor visibility', () => {
  const area = areaMarkupSchema.parse({
    id: 'a',
    kind: 'area',
    name: 'Lattia & seinä',
    frame: sketchFrame([0, 0, 0], [0, 0, 1]),
    rectangles: [
      [0, 0, 1000, 1000],
      [500, 0, 1500, 1000],
    ],
  });
  const note = noteMarkupSchema.parse({
    id: 'n',
    kind: 'note',
    text: 'Lista <tähän>',
    anchor: { point: [0, 0, 0] },
    fallback: [0, 0, 0],
    offset: [10, 10, 0],
  });
  const project = { ...freshProject(), annotations: [area, note] };
  const loaded = parseProject(JSON.stringify(project));
  expect(loaded.annotations).toEqual(project.annotations);
  expect(loaded.bodies).toEqual([]);
  expect(areaMarkupSchema.safeParse({ ...area, rectangles: [[0, 0, 0, 1]] }).success).toBe(false);
  const svg = markupSvg(loaded.annotations!, [], (p) => p, ['a']);
  expect(svg).toContain('Lattia &amp; seinä');
  expect(svg).toContain('Lista &lt;tähän&gt;');
  expect(svg).toContain('1,5 m²');
  expect(svg).toContain('#e57820');
  const projection = {
    viewBox: [0, 0, 1500, 1000] as [number, number, number, number],
    visible: [],
    hidden: [],
  };
  expect(createSheet(project, projection, 'top', 10).svg).toContain('Lista &lt;tähän&gt;');
  expect(
    createSheet(
      { ...project, settings: { ...project.settings, markupsHidden: true } },
      projection,
      'top',
      10,
    ).svg,
  ).not.toContain('data-markup=');
  expect(markupSvg([{ ...note, hidden: true }], [], (p) => p)).toBe('');
  expect(shareProjectData(project, loaded).annotations).toBe(project.annotations);
});

test('changing area planes keeps the first corner, dimensions and overlapping union', async () => {
  const { reframeArea } = await import('./markups');
  const { fromUV, toUV } = await import('./sketch');
  const start = areaMarkupSchema.parse({
    id: 'a',
    kind: 'area',
    name: 'Lattia',
    frame: sketchFrame([0, 0, 13], [0, 0, 1]),
    rectangles: [
      [48, 98, 1048, 1098],
      [548, 98, 1548, 1098],
    ],
  });
  const pivot = fromUV([48, 98], start.frame);
  for (const normal of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as [number, number, number][]) {
    const result = reframeArea(start, normal, pivot);
    expect(areaUnion(result.rectangles).area).toBe(1_500_000);
    expect(result.frame.normal).toEqual(normal);
    expect(fromUV([0, 0], result.frame)).toEqual(pivot);
    expect(toUV(pivot, result.frame)).toEqual([0, 0]);
    expect(result.rectangles).toEqual([
      [0, 0, 1000, 1000],
      [500, 0, 1500, 1000],
    ]);
  }
});
test('standalone notes retain their anchor but omit the leader from drawing and page bounds', async () => {
  const { markupPoints } = await import('./markups');
  const note = noteMarkupSchema.parse({
    id: 'n',
    kind: 'note',
    text: 'Ilman viivaa',
    leader: false,
    anchor: { point: [10000, 0, 0] },
    fallback: [10000, 0, 0],
    offset: [-9990, 10, 0],
  });
  expect(markupPoints(note, [])).toEqual([[10, 10, 0]]);
  expect(markupSvg([note], [], (p) => p)).not.toContain('note-leader');
  expect(markupSvg([{ ...note, leader: true }], [], (p) => p)).toContain('note-leader');
  expect(
    parseProject(JSON.stringify({ ...freshProject(), annotations: [note] })).annotations![0],
  ).toEqual(note);
});
