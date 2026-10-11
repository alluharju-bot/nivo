import { describe, expect, it } from 'vitest';
import { freshProject, makeBody, makeProfileBody, parseProject, projectSchema } from './project';
import { sketchFrame } from './sketch';
import {
  assignPartType,
  quantitiesCSV,
  quantityRows,
  removePartType,
  savePartType,
  setQuantityDimensions,
} from './quantities';
import { History } from './history';
import { groupBodies, translateSelection } from './groups';
import { asComponent, uniqueComponents } from './components';
import { cutGeometryKey } from './cutting';

const types = [
  { id: 'board', name: 'Laudelauta', unit: 'length' as const },
  { id: 'panel', name: 'Eriste', unit: 'area' as const },
  { id: 'screw', name: 'Ruuvi', unit: 'count' as const },
];
describe('part types and quantities', () => {
  it('sums actual instances including hidden subgroups, excludes construction and separates units', () => {
    const a = { ...asComponent(makeBody(2200, 90, 28)), partTypeId: 'board', groupId: 'sauna' };
    const b = { ...a, id: 'b', hidden: true, groupId: 'child' };
    const c = { ...makeBody(1800, 90, 28), partTypeId: 'board', groupId: 'child' };
    const p = { ...makeBody(1200, 600, 50), partTypeId: 'panel' };
    const screw = { ...makeBody(4, 4, 50), partTypeId: 'screw' };
    const helper = { ...c, id: 'helper', purpose: 'construction' as const };
    const project = {
      ...freshProject(),
      partTypes: types,
      groups: [
        { id: 'sauna', name: 'Sauna', hidden: false },
        { id: 'child', name: 'Alalaude', parentId: 'sauna', hidden: true },
      ],
      bodies: [a, b, c, p, screw, helper],
    };
    const rows = quantityRows(project, project.bodies, []);
    expect(rows.find((r) => r.type?.id === 'board')).toMatchObject({
      count: 3,
      total: 6.2,
      missing: 0,
      batches: [
        { dimensions: [2200], count: 2, total: 4.4 },
        { dimensions: [1800], count: 1, total: 1.8 },
      ],
    });
    expect(rows.find((r) => r.type?.id === 'panel')).toMatchObject({
      count: 1,
      total: 0.72,
      missing: 0,
    });
    expect(rows.find((r) => r.type?.id === 'screw')).toMatchObject({ count: 1, total: 1 });
    expect(quantityRows(project, groupBodies(project, 'sauna'), [])).toHaveLength(1);
  });
  it('assigns selected instances without changing links or unselected siblings, copies and uniques retain types', () => {
    const a = asComponent(makeBody(2200, 90, 28)),
      b = { ...a, id: 'other' };
    const before = { ...freshProject(), partTypes: types, bodies: [a, b] };
    const assigned = assignPartType(before, [a.id], 'board');
    expect(assigned.bodies[0].partTypeId).toBe('board');
    expect(assigned.bodies[1]).toBe(b);
    expect(assigned.bodies[0].component).toEqual(a.component);
    const copied = translateSelection(assigned, [a.id], [3000, 0, 0], true).project;
    const row = quantityRows(copied, copied.bodies, []).find((r) => r.type?.id === 'board')!;
    expect(row.count).toBe(2);
    expect(row.total).toBe(4.4);
    const unique = uniqueComponents(
      copied,
      row.parts.map((p) => p.body.id),
    );
    expect(quantityRows(unique, unique.bodies, []).find((r) => r.type?.id === 'board')?.total).toBe(
      4.4,
    );
  });
  it('keeps unknown shapes explicitly incomplete and invalidates edited manual blanks', () => {
    const circle = {
      ...makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 20),
      partTypeId: 'panel',
    };
    const project = { ...freshProject(), partTypes: types, bodies: [circle] };
    expect(quantityRows(project, project.bodies, [])[0]).toMatchObject({
      total: 0,
      missing: 1,
      count: 1,
    });
    const measured = setQuantityDimensions(project, circle.id, [220, 220, 20]);
    expect(quantityRows(measured, measured.bodies, [])[0]).toMatchObject({
      total: 0.0484,
      missing: 0,
    });
    const changed = { ...measured.bodies[0], feature: { ...circle.feature, height: 30 } };
    expect(quantityRows({ ...measured, bodies: [changed] }, [changed], [])[0].missing).toBe(1);
    const csv = quantitiesCSV(quantityRows({ ...measured, bodies: [changed] }, [changed], []));
    expect(csv).toContain('"Eriste";"1";"0";"m²"');
    expect(csv).toContain('"Tarkistettavia osia"');
  });
  it('uses an existing confirmed cutting blank and captures it for future copies', () => {
    const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 20);
    const project = {
      ...freshProject(),
      partTypes: types,
      bodies: [circle],
      settings: {
        ...freshProject().settings,
        cutting: {
          length: 2800,
          width: 2070,
          kerf: 3,
          margin: 10,
          parts: {
            [circle.id]: {
              blank: {
                dimensions: [220, 220, 20] as [number, number, number],
                geometryKey: cutGeometryKey(circle),
              },
            },
          },
        },
      },
    };
    const assigned = assignPartType(project, [circle.id], 'panel');
    expect(assigned.bodies[0].quantityBasis?.manual).toBe(true);
    const copied = translateSelection(assigned, [circle.id], [400, 0, 0], true).project;
    expect(quantityRows(copied, copied.bodies, [])[0]).toMatchObject({
      count: 2,
      total: 0.0968,
      missing: 0,
    });
  });
  it('validates references and names, persists definitions, and restores assignment and deletion through history', () => {
    const body = makeBody(2200, 90, 28),
      initial = { ...freshProject(), bodies: [body] };
    let project = savePartType(initial, { name: ' Laudelauta ', unit: 'length' });
    const type = project.partTypes![0];
    expect(() => savePartType(project, { name: 'laudelauta', unit: 'count' })).toThrow(
      /jo olemassa/,
    );
    expect(() => savePartType(project, { name: ' ', unit: 'count' })).toThrow(/nimi/);
    project = assignPartType(project, [body.id], type.id);
    const restored = parseProject(JSON.stringify(project));
    expect(restored.partTypes).toEqual(project.partTypes);
    expect(restored.bodies).toEqual(project.bodies);
    expect(projectSchema.safeParse({ ...project, partTypes: [] }).success).toBe(false);
    expect(
      projectSchema.safeParse({ ...project, partTypes: [type, { ...type, id: 'duplicate' }] })
        .success,
    ).toBe(false);
    const history = new History(initial);
    history.commit(project);
    history.commit(removePartType(project, type.id));
    expect(history.current.bodies[0].partTypeId).toBeUndefined();
    history.undo();
    expect(history.current.bodies[0].partTypeId).toBe(type.id);
    history.undo();
    expect(history.current).toBe(initial);
    expect(parseProject(JSON.stringify(initial)).partTypes).toBeUndefined();
  });
  it('protects held parts and rejects invalid lengths', () => {
    const body = { ...makeBody(2200, 90, 28), locked: true, partTypeId: 'board' };
    const p = { ...freshProject(), bodies: [body], partTypes: types };
    expect(() => assignPartType(p, [body.id], 'panel')).toThrow(/kiinnitetty/);
    expect(() => removePartType(p, 'board')).toThrow(/kiinnitetty/);
    expect(() => setQuantityDimensions(p, body.id, [2200, 90, 28])).toThrow(/kiinnitetty/);
    const unlocked = { ...p, bodies: [{ ...body, locked: false }] };
    for (const value of [NaN, -1, 0, 100001])
      expect(() => setQuantityDimensions(unlocked, body.id, [value, 0, 0])).toThrow();
  });
  it('escapes type names in spreadsheet exports', () => {
    const body = { ...makeBody(100, 100, 10), partTypeId: 'x' };
    const p = {
      ...freshProject(),
      bodies: [body],
      partTypes: [{ id: 'x', name: '=HYPERLINK("x")', unit: 'count' as const }],
    };
    expect(quantitiesCSV(quantityRows(p, p.bodies, []))).toContain('"\'=HYPERLINK(""x"")"');
  });
});
