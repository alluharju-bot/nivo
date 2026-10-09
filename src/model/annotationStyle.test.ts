import { expect, test } from 'vitest';
import { annotationText } from './annotationStyle';
import {
  freshProject,
  makeBody,
  parseProject,
  dimensionValue,
  type Guide,
  type Project,
} from './project';
import { createSheet } from '../drawing/svg';
import { upsertGuide } from './guideMerge';
import { ActivityJournal, sameSelection, selectionDescription } from './activity';

const body = makeBody(600, 400, 20);
const guide: Guide = {
  id: 'g',
  mode: 'free',
  plane: 'XY',
  angle: 0,
  length: 100,
  anchor: { point: [0, 0, 20] },
  endAnchor: { point: [100, 0, 20] },
};
const project: Project = {
  ...freshProject(),
  bodies: [body],
  guides: [{ ...guide, hidden: true, label: 'Apu {mitta}' }],
  dimensions: [
    {
      id: 'extent',
      bodyId: body.id,
      axis: 'x',
      from: 'min',
      to: 'max',
      label: 'Leveys <{mitta}> & valmis',
    },
    {
      id: 'points',
      kind: 'points',
      start: { point: [0, 0, 20] },
      end: { point: [100, 0, 20] },
      fallback: [
        [0, 0, 20],
        [100, 0, 20],
      ],
      axis: 'distance',
      offset: [0, -40, 0],
      normal: [0, 0, 1],
      label: '100?',
      hidden: true,
    },
    {
      id: 'overall',
      kind: 'overall',
      target: { kind: 'parts', ids: [body.id] },
      axis: 'y',
      label: 'Syvyys',
      hidden: true,
    },
  ],
};
test('annotation labels and per-item visibility survive project save without replacing measurements', () => {
  const loaded = parseProject(JSON.stringify(project));
  expect(loaded.dimensions).toEqual(project.dimensions);
  expect(loaded.guides).toEqual(project.guides);
  expect(dimensionValue(loaded, loaded.dimensions[1])).toBe(100);
  expect(annotationText({ label: 'Leveys {mitta} mm' }, 48, 'auto')).toBe('Leveys 48 mm');
  expect(annotationText({ label: ' ' }, 48, '48 mm')).toBe('48 mm');
  const legacy = parseProject(
    JSON.stringify({ ...freshProject(), bodies: [body], guides: [guide] }),
  );
  expect(legacy.guides[0].hidden).toBeUndefined();
});
test('drawing exports escape custom labels, keep true measurements and omit only hidden annotations', () => {
  const projection = {
    viewBox: [0, -400, 600, 400] as [number, number, number, number],
    visible: [],
    hidden: [],
  };
  const sheet = createSheet(project, projection, 'top', 5).svg;
  expect(sheet).toContain('Leveys &lt;600&gt; &amp; valmis');
  expect(sheet).toContain('data-mm="600"');
  expect(sheet).not.toContain('data-dimension="points"');
  expect(sheet).not.toContain('data-dimension="overall"');
  const hidden = createSheet(
    { ...project, settings: { ...project.settings, measurementsHidden: true } },
    projection,
    'top',
    5,
  ).svg;
  expect(hidden).not.toContain('data-dimension=');
  const shown = createSheet(
    { ...project, dimensions: project.dimensions.map((d) => ({ ...d, hidden: false })) },
    projection,
    'top',
    5,
  ).svg;
  expect(shown).toContain('100?');
  expect(shown).toContain('data-mm="100"');
});
test('hidden or independently labelled measurements cannot absorb a new visible stroke', () => {
  expect(upsertGuide([], project.guides, { ...guide, id: 'new' }).guides).toHaveLength(2);
  expect(
    upsertGuide([], [{ ...guide, label: 'reference' }], { ...guide, id: 'new' }).guides,
  ).toHaveLength(2);
  const edited = upsertGuide([], project.guides, {
    ...guide,
    length: 200,
    endAnchor: { point: [200, 0, 20] },
  }).guide;
  expect(edited.hidden).toBe(true);
  expect(edited.label).toBe('Apu {mitta}');
});
test('dimension selections survive activity serialization and stay distinct from bodies and guides', () => {
  const context = { ids: [], guideIds: ['g'], dimensionIds: ['a', 'b'] };
  const log = new ActivityJournal('annotations');
  log.record({ label: 'Merkintä piilotettu', context }, 'edit');
  expect(new ActivityJournal('annotations', log.serialize()).entries[0].context).toEqual(context);
  expect(sameSelection(context, { ...context, dimensionIds: ['b', 'a'] })).toBe(true);
  expect(sameSelection(context, { ...context, dimensionIds: ['b'] })).toBe(false);
  expect(selectionDescription(context)).toContain('2 dimensiota');
});

test('section annotation styles round-trip and exported text remains escaped', async () => {
  const { sectionFrame, sectionBodySignature } = await import('./sections');
  const { sectionSheet } = await import('../drawing/sectionSvg');
  const a = {
    bodyId: body.id,
    point: [0, 0, 10] as [number, number, number],
    signature: sectionBodySignature(body),
  };
  const b = { ...a, point: [600, 0, 10] as [number, number, number] };
  const section = {
    id: 's',
    name: 'A',
    flipped: false,
    frame: sectionFrame('z', [0, 0, 10]),
    dimensions: [
      {
        id: 's-dim',
        start: a,
        end: b,
        axis: 'horizontal' as const,
        offset: 60,
        label: 'Leikkaus <{mitta}>',
        hidden: false,
      },
    ],
  };
  const p = parseProject(JSON.stringify({ ...project, sections: [section] }));
  expect(p.sections?.[0]).toEqual(section);
  const result = {
    caps: [],
    anchors: [a, b],
    projection: {
      visible: [],
      hidden: [],
      viewBox: [0, -400, 600, 400] as [number, number, number, number],
    },
  };
  expect(sectionSheet(p, section, result, 5).svg).toContain('Leikkaus &lt;600&gt;');
  expect(
    sectionSheet(
      p,
      { ...section, dimensions: section.dimensions.map((d) => ({ ...d, hidden: true })) },
      result,
      5,
    ).svg,
  ).not.toContain('data-section-dimension=');
});
