import { describe, expect, it } from 'vitest';
import { freshProject, makeBody, projectSchema } from './project';
import { cutDefaults, type CutSettings } from './cutSettings';
import { createCutPlan, cutGeometryKey, cuttingParts, type CutPart } from './cutting';
import { assemblyParts } from './parts';
import { defaultAppearance } from './materials';
import { translateSelection } from './groups';
import { cuttingCSV, cutListSVGs, cutSheetSVG } from '../drawing/cutting';

const sheet: CutSettings = { length: 1000, width: 600, margin: 0, kerf: 3.2 };
function panels(sizes: [number, number, number][], settings = sheet) {
  const project = freshProject();
  project.bodies = sizes.map(([l, w, t], i) => makeBody(l, w, t, [i * 5, 0, 0], `Levy ${i + 1}`));
  return cuttingParts(project, project.bodies, [], settings);
}

describe('sheet cutting plans', () => {
  it('copies manufacturing choices with a whole assembly and keeps the copies independent', () => {
    const project = freshProject();
    project.groups = [{ id: 'cab', name: 'Kaappi', hidden: false }];
    const body = { ...makeBody(600, 400, 18), groupId: 'cab' };
    project.bodies = [body];
    project.settings.cutting = {
      ...sheet,
      parts: {
        [body.id]: {
          grain: 'width',
          stock: 'Ovimateriaali',
          blank: { dimensions: [610, 410, 18], geometryKey: cutGeometryKey(body) },
        },
      },
    };
    const copied = translateSelection(project, [body.id], [1000, 0, 0], true, 'cab');
    const choices = copied.project.settings.cutting!.parts!;
    expect(choices[copied.ids[0]]).toEqual(choices[body.id]);
    expect(choices[copied.ids[0]]).not.toBe(choices[body.id]);
    const parts = cuttingParts(
      copied.project,
      copied.project.bodies,
      [],
      copied.project.settings.cutting!,
    );
    expect(parts.map((p) => p.dimensions)).toEqual([
      [610, 410, 18],
      [610, 410, 18],
    ]);
    expect(parts.every((p) => p.grain === 'width' && !p.issue)).toBe(true);
    expect(project.bodies).toHaveLength(1);
  });
  it('fits exact stock edges without charging an extra kerf, but reserves kerf between parts', () => {
    expect(createCutPlan(panels([[1000, 600, 18]]), sheet).sheets).toHaveLength(1);
    expect(
      createCutPlan(
        panels([
          [500, 600, 18],
          [500, 600, 18],
        ]),
        sheet,
      ).sheets,
    ).toHaveLength(2);
    const sizes: [number, number, number][] = [
      [498.4, 600, 18],
      [498.4, 600, 18],
    ];
    const plan = createCutPlan(panels(sizes), sheet);
    expect(plan.sheets).toHaveLength(1);
    expect(plan.usedArea).toBeCloseTo(598080, 6);
    expect(plan.stockArea).toBe(600000);
  });
  it('keeps stock finishes and thicknesses separate, with deliberate stock-name overrides', () => {
    const project = freshProject();
    project.bodies = [makeBody(300, 200, 18), makeBody(300, 200, 18), makeBody(300, 200, 6)];
    project.bodies[1].color = '#ffffff';
    expect(
      createCutPlan(cuttingParts(project, project.bodies, [], sheet), sheet).sheets,
    ).toHaveLength(3);
    const settings = {
      ...sheet,
      parts: Object.fromEntries(
        project.bodies.map((b) => [b.id, { stock: 'Valkoinen melamiini' }]),
      ),
    };
    const plan = createCutPlan(cuttingParts(project, project.bodies, [], settings), settings);
    expect(plan.sheets).toHaveLength(2);
    expect(plan.sheets.find((s) => s.thickness === 18)?.placements).toHaveLength(2);
  });
  it('honours both grain directions and never silently rotates an oversized locked part', () => {
    const p = panels([[800, 500, 18]])[0];
    const settings = { ...sheet, length: 600, width: 900 };
    expect(createCutPlan([p], settings).sheets[0].placements[0].rotated).toBe(true);
    expect(createCutPlan([{ ...p, grain: 'length' }], settings).unplaced[0].reason).toContain(
      'syysuunnalla',
    );
    expect(
      createCutPlan([{ ...p, grain: 'width' }], settings).sheets[0].placements[0].rotated,
    ).toBe(true);
    expect(createCutPlan([p], { ...settings, margin: 60 }).unplaced).toHaveLength(1);
  });
  it('preserves every selected part exactly once, margins, kerfs, non-overlap and useful offcuts', () => {
    const sizes = Array.from(
      { length: 80 },
      (_, i) => [80 + ((i * 19) % 350), 50 + ((i * 31) % 200), 18] as [number, number, number],
    );
    const settings = { ...sheet, margin: 12 };
    const parts = panels(sizes, settings),
      original = structuredClone(parts);
    const plan = createCutPlan(parts, settings);
    expect(plan.unplaced).toHaveLength(0);
    expect(plan.sheets.flatMap((s) => s.placements.map((p) => p.part.id)).sort()).toEqual(
      parts.map((p) => p.id).sort(),
    );
    for (const s of plan.sheets) {
      for (const [i, p] of s.placements.entries()) {
        expect(p.x).toBeGreaterThanOrEqual(settings.margin);
        expect(p.y).toBeGreaterThanOrEqual(settings.margin);
        expect(p.x + p.width).toBeLessThanOrEqual(settings.length - settings.margin + 1e-6);
        expect(p.y + p.height).toBeLessThanOrEqual(settings.width - settings.margin + 1e-6);
        for (const q of s.placements.slice(i + 1))
          expect(
            p.x + p.width + settings.kerf <= q.x + 1e-6 ||
              q.x + q.width + settings.kerf <= p.x + 1e-6 ||
              p.y + p.height + settings.kerf <= q.y + 1e-6 ||
              q.y + q.height + settings.kerf <= p.y + 1e-6,
          ).toBe(true);
      }
      const rectangles = [...s.placements, ...s.remainders];
      for (const [i, p] of rectangles.entries())
        for (const q of rectangles.slice(i + 1))
          expect(
            p.x + p.width <= q.x + 1e-6 ||
              q.x + q.width <= p.x + 1e-6 ||
              p.y + p.height <= q.y + 1e-6 ||
              q.y + q.height <= p.y + 1e-6,
          ).toBe(true);
      expect(rectangles.reduce((area, r) => area + r.width * r.height, 0)).toBeLessThanOrEqual(
        (settings.length - 24) * (settings.width - 24) + 1e-6,
      );
    }
    expect(plan.sheets.length).toBeLessThan(12);
    expect(createCutPlan(parts, settings)).toEqual(plan);
    expect(parts).toEqual(original);
  });
  it('uses nested assemblies, preserves numbering, flags complex geometry and invalidates edited manual blanks', () => {
    const project = freshProject();
    project.groups = [
      { id: 'a', name: 'Keittiö', hidden: false },
      { id: 'b', name: 'Kaappi', parentId: 'a', hidden: false },
    ];
    const body = { ...makeBody(500, 300, 18), groupId: 'b', hidden: true };
    const curved = {
      ...makeBody(),
      id: 'complex',
      feature: {
        type: 'brep' as const,
        width: 800,
        depth: 700,
        height: 40,
        solid: true,
        data: 'test',
        topologyId: 'one',
      },
    };
    project.bodies = [body, curved];
    expect(cuttingParts(project, assemblyParts(project, 'a'), [], sheet)[0].group).toBe(
      'Keittiö / Kaappi',
    );
    const settings: CutSettings = {
      ...sheet,
      parts: {
        complex: { blank: { geometryKey: cutGeometryKey(curved), dimensions: [800, 700, 40] } },
      },
    };
    expect(cuttingParts(project, project.bodies, [], sheet)[1].dimensions).toBeUndefined();
    expect(cuttingParts(project, project.bodies, [], settings)[1].manual).toBe(true);
    curved.feature.topologyId = 'two';
    const parts = cuttingParts(project, project.bodies, [], settings);
    expect(parts[1].dimensions).toBeUndefined();
    expect(parts[1].issue).toContain('Muoto muuttui');
    parts[1].included = false;
    const plan = createCutPlan(parts, sheet);
    expect(plan.excluded).toHaveLength(1);
    expect(plan.unplaced).toHaveLength(0);
    expect(parts.map((p) => p.number)).toEqual([1, 2]);
    expect(
      projectSchema.parse({ ...project, settings: { ...project.settings, cutting: settings } })
        .settings.cutting,
    ).toEqual(settings);
  });
  it('defaults wood to length grain and rejects invalid sheet settings', () => {
    const project = freshProject();
    project.bodies = [{ ...makeBody(600, 400, 18), appearance: defaultAppearance('melamine-oak') }];
    expect(cuttingParts(project, project.bodies, [], cutDefaults)[0].grain).toBe('length');
    for (const settings of [
      { ...sheet, margin: 301 },
      { ...sheet, kerf: -1 },
      { ...sheet, length: NaN },
      { ...sheet, width: 0 },
    ])
      expect(() => createCutPlan([], settings)).toThrow();
  });
  it('exports matching numbers, dimensions and incomplete status with XML/CSV escaping and paginated lists', () => {
    const parts = panels(Array.from({ length: 17 }, () => [100, 100, 18]));
    parts[0].name = '=1+1;"<script>"';
    const unknown: CutPart = {
      ...parts[0],
      id: 'unknown',
      number: 18,
      dimensions: undefined,
      issue: 'Anna aihion mitat',
    };
    parts.push(unknown);
    const plan = createCutPlan(parts, sheet);
    const svg = cutSheetSVG(plan.sheets[0], sheet, '<Koti>', plan.unplaced.length);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('KESKENERÄINEN');
    const lists = cutListSVGs(parts, plan, sheet, 'Kaappi');
    expect(lists).toHaveLength(2);
    expect(lists[1]).toContain('Anna aihion mitat');
    expect(cuttingCSV(parts, plan)).toContain('"\'=1+1;""<script>"""');
    expect(cuttingCSV(parts, plan)).toContain('"100";"100";"18";"1"');
  });
});
