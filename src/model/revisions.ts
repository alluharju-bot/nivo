import { layerAssetIds } from './decals';
import { equalJson } from './sharing';
import type { Body, Project } from './project';
import { bodyGeometryKey } from '../cad/meshKey';

export type ChangeKind = 'added' | 'removed' | 'modified';
export const changeLabels: Record<ChangeKind, string> = {
  added: 'Lisätty',
  removed: 'Poistettu',
  modified: 'Muokattu',
};
export const changeColors: Record<ChangeKind, string> = {
  added: '#268d6d',
  removed: '#d65767',
  modified: '#dc941e',
};
export type BodyChange = {
  id: string;
  kind: ChangeKind;
  before?: Body;
  after?: Body;
  details: string[];
  number: number;
};
const same = equalJson;
function groupPath(project: Project, body: Body) {
  const path: unknown[] = [];
  let id = body.groupId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const g = project.groups.find((g) => g.id === id);
    if (!g) break;
    path.push([g.id, g.name, g.kind, g.hidden, g.locked]);
    id = g.parentId;
  }
  return path;
}
function surface(project: Project, body: Body) {
  const appearances = [
    body.appearance,
    ...Object.values(body.faceMaterials ?? {}).map((f) => f.appearance),
  ];
  const assets = appearances.flatMap((a) => layerAssetIds(a));
  return [
    body.color,
    body.material,
    body.appearance,
    body.faceMaterials,
    body.textureFrame,
    assets.map((id) => project.assets?.[id]),
  ];
}
/** Identity is retained by normal saves. Names are never used to guess correspondence. */
export function compareProjects(before: Project, after: Project): BodyChange[] {
  const old = new Map(before.bodies.map((b) => [b.id, b]));
  const changes: BodyChange[] = [];
  for (const body of after.bodies) {
    const previous = old.get(body.id);
    old.delete(body.id);
    if (!previous) {
      changes.push({ id: body.id, kind: 'added', after: body, details: ['Uusi osa'], number: 0 });
      continue;
    }
    const details: string[] = [];
    if (bodyGeometryKey(previous) !== bodyGeometryKey(body)) details.push('Geometria');
    if (!same(previous.origin, body.origin)) details.push('Sijainti');
    if (!same(surface(before, previous), surface(after, body))) details.push('Pinta / materiaali');
    if (previous.name !== body.name) details.push('Nimi');
    if (
      (previous.quantityBasis &&
        body.quantityBasis &&
        !same(previous.quantityBasis.dimensions, body.quantityBasis.dimensions)) ||
      !!previous.quantityBasis?.manual !== !!body.quantityBasis?.manual
    )
      details.push('Aihiomitat');
    if (!same(groupPath(before, previous), groupPath(after, body))) details.push('Ryhmä');
    if (
      !same(
        [previous.partTypeId, before.partTypes?.find((t) => t.id === previous.partTypeId)],
        [body.partTypeId, after.partTypes?.find((t) => t.id === body.partTypeId)],
      )
    )
      details.push('Tyyppi');
    if (previous.hidden !== body.hidden || previous.locked !== body.locked)
      details.push('Näkyvyys / lukitus');
    if (!same(previous.component, body.component) || previous.purpose !== body.purpose)
      details.push('Komponentti / linkitys');
    if (details.length)
      changes.push({
        id: body.id,
        kind: 'modified',
        before: previous,
        after: body,
        details,
        number: 0,
      });
  }
  for (const body of old.values())
    changes.push({
      id: body.id,
      kind: 'removed',
      before: body,
      details: ['Osa poistettu'],
      number: 0,
    });
  return changes.map((c, i) => ({ ...c, number: i + 1 }));
}
export function revisionCsv(changes: BodyChange[], baseline: string, current: string) {
  // Prefix spreadsheet formulas in user-provided names; quote fields and use Finnish separators.
  const cell = (s: string) => `"${(/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`;
  return (
    '\ufeff' +
    [
      ['Vertailuversio', baseline],
      ['Nykyinen malli', current],
      ['Nro', 'Muutos', 'Osa', 'Aiempi nimi', 'Muuttuneet tiedot'],
      ...changes.map((c) => [
        String(c.number),
        changeLabels[c.kind],
        (c.after ?? c.before)!.name,
        c.before?.name ?? '',
        c.details.join(', '),
      ]),
    ]
      .map((row) => row.map(cell).join(';'))
      .join('\r\n')
  );
}
