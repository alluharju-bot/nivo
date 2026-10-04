import { expect, it } from 'vitest';
import { addOverallDimensions } from '../model/dimensions';
import { freshProject, makeBody, parseProject } from '../model/project';
import { sectionFrame } from '../model/sections';
import { type DrawingSheet } from '../model/drawingSheets';
import { createMultiSheet, multiSheetScale, sheetProject, type SheetProjection } from './sheets';

const body = makeBody(600, 400, 720);
const section = {
  id: 'a',
  name: 'A–A',
  frame: sectionFrame('y', [0, 200, 0]),
  flipped: false,
  dimensions: [],
};
const project = addOverallDimensions(
  { ...freshProject(), bodies: [body], sections: [section] },
  { kind: 'parts', ids: [body.id] },
  ['x', 'y', 'z'],
);
const definition: DrawingSheet = {
  id: 'sheet',
  name: 'Kaappi <A>',
  scope: { kind: 'parts', ids: [body.id] },
  hidden: true,
  views: [
    { kind: 'standard', view: 'front' },
    { kind: 'standard', view: 'right' },
    { kind: 'standard', view: 'top' },
    { kind: 'section', sectionId: 'a' },
  ],
};
const projections = new Map<string, SheetProjection>([
  [
    'front',
    {
      kind: 'standard',
      projection: {
        visible: ['M0 0L600 0L600 -720Z'],
        hidden: ['M10 0V-720'],
        viewBox: [0, -720, 600, 720],
      },
    },
  ],
  [
    'right',
    { kind: 'standard', projection: { visible: [], hidden: [], viewBox: [0, -720, 400, 720] } },
  ],
  [
    'top',
    { kind: 'standard', projection: { visible: [], hidden: [], viewBox: [0, -400, 600, 400] } },
  ],
  [
    'section:a',
    {
      kind: 'section',
      result: {
        caps: [],
        anchors: [],
        projection: { visible: [], hidden: [], viewBox: [0, -720, 600, 720] },
      },
    },
  ],
]);
it('lays out standard views and a section at one actual paper scale, with all dimension values unchanged', () => {
  const scale = multiSheetScale(project, definition, projections);
  expect(scale).toBe(20);
  const sheet = createMultiSheet(project, definition, projections, scale);
  expect(sheet.fits).toBe(true);
  expect(sheet.orphanCount).toBe(0);
  expect(sheet.svg.match(/data-scale="20"/g)).toHaveLength(4);
  expect(sheet.svg.match(/scale\(0.05\)/g)).toHaveLength(4);
  expect(sheet.svg).toContain('data-mm="600"');
  expect(sheet.svg).toContain('Kaappi &lt;A&gt;');
  expect(sheet.svg).toContain('section-hatch-a');
  expect(createMultiSheet(project, definition, projections, 1).fits).toBe(false);
  expect(createMultiSheet(project, definition, projections, 1).svg).toContain('ei mahdu');
});
it('blocks missing scopes, deleted sections and invalid dimensions, and persists only definitions', () => {
  const p = parseProject(JSON.stringify({ ...project, drawingSheets: [definition] }));
  expect(p.drawingSheets).toEqual([definition]);
  expect(JSON.stringify(p.drawingSheets)).not.toContain('projection');
  expect(sheetProject({ ...p, bodies: [] }, definition).missing).toBe(true);
  expect(createMultiSheet({ ...p, sections: [] }, definition, projections, 20).fits).toBe(false);
  expect(createMultiSheet({ ...p, sections: [] }, definition, projections, 20).orphanCount).toBe(1);
  const broken = {
    ...p,
    dimensions: [
      ...p.dimensions,
      {
        id: 'lost',
        kind: 'overall' as const,
        target: { kind: 'group' as const, groupId: 'gone' },
        axis: 'x' as const,
      },
    ],
  };
  expect(createMultiSheet(broken, definition, projections, 20).orphanCount).toBe(3);
});
