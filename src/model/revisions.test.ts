import { expect, it } from 'vitest';
import { freshProject, makeBody, parseProject } from './project';
import { compareProjects, revisionCsv } from './revisions';
it('compares persistent identities, ignoring time, order and annotations without losing removed geometry', () => {
  const before = freshProject();
  const kept = makeBody(100, 50, 20, [0, 0, 0], 'Lauta');
  const removed = makeBody(30, 30, 30, [200, 0, 0], 'Poistettava');
  before.bodies = [kept, removed];
  const after = parseProject(JSON.stringify(before));
  const added = makeBody(10, 10, 10, [300, 0, 0], 'Lauta');
  after.bodies = [
    added,
    { ...after.bodies[0], origin: [15, 0, 0], color: '#ffffff', name: 'Uusi nimi' },
  ];
  const changes = compareProjects(before, after);
  expect(changes.map((c) => c.kind)).toEqual(['added', 'modified', 'removed']);
  expect(changes[1].details).toEqual(['Sijainti', 'Pinta / materiaali', 'Nimi']);
  expect(changes[2].before).toBe(removed);
  expect(before.bodies[0].origin).toEqual([0, 0, 0]);
  const reordered = {
    ...before,
    bodies: [removed, kept],
    updatedAt: new Date().toISOString(),
    name: 'Toinen nimi',
  };
  expect(compareProjects(before, reordered)).toEqual([]);
});
it('detects geometry, group and type changes with exact names and meaningful labels', () => {
  const before = freshProject();
  before.groups = [{ id: 'g', name: 'Sauna', hidden: false }];
  before.partTypes = [{ id: 't', name: 'Lauta', unit: 'length' }];
  const body = { ...makeBody(), groupId: 'g', partTypeId: 't' };
  before.bodies = [body];
  const after = {
    ...before,
    groups: [{ ...before.groups[0], name: 'Pesuhuone' }],
    partTypes: [{ ...before.partTypes[0], name: 'Paneeli' }],
    bodies: [{ ...body, feature: { ...body.feature, height: 80 } }],
  };
  expect(compareProjects(before, after)[0].details).toEqual(['Geometria', 'Ryhmä', 'Tyyppi']);
});
it('exports a numbered change list with escaped user text and safe spreadsheet cells', () => {
  const p = freshProject();
  const next = { ...p, bodies: [makeBody(10, 10, 10, [0, 0, 0], '=SUM(1;2)')] };
  const csv = revisionCsv(compareProjects(p, next), 'A "versio"', 'Nykyinen');
  expect(csv).toContain('"A ""versio"""');
  expect(csv).toContain('"\'=SUM(1;2)"');
  expect(csv).toContain('"1";"Lisätty"');
});
