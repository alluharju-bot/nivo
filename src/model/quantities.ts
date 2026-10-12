import { uid, type Body, type Project, type Vec3 } from './project';
import type { BodyMesh } from '../cad/protocol';
import { cutGeometryKey } from './cutting';
import { orderedQuantityBasis, quantityBasis } from './quantityBasis';
import { partTypeSchema, typeNameKey, type PartType } from './quantitySchema';
import { requireMovable } from './transforms';
import type { CutSettings } from './cutSettings';

export const quantityUnits = { count: 'kpl', length: 'm', area: 'm²' } as const;
export const quantityMethods = {
  count: 'Kappaleet',
  length: 'Pituus',
  area: 'Aihioala · pituus × leveys',
} as const;
const numberFormat = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 3 });
const smallNumberFormat = new Intl.NumberFormat('fi-FI', { maximumSignificantDigits: 3 });
export const quantityNumber = (n: number) =>
  (n !== 0 && Math.abs(n) < 0.001 ? smallNumberFormat : numberFormat).format(n);
export const quantityBodies = (bodies: Body[]) =>
  bodies.filter((b) => ['model', 'component'].includes(b.purpose));

export type QuantityPart = {
  body: Body;
  dimensions?: Vec3;
  value?: number;
  issue?: string;
  manual: boolean;
};
export type QuantityRow = {
  type?: PartType;
  name: string;
  unit: PartType['unit'];
  parts: QuantityPart[];
  count: number;
  total: number;
  missing: number;
  batches: { dimensions: number[]; count: number; total: number }[];
};
export function quantityRows(project: Project, bodies: Body[], meshes: BodyMesh[]): QuantityRow[] {
  const meshById = new Map(meshes.map((m) => [m.id, m]));
  const types = new Map((project.partTypes ?? []).map((t) => [t.id, t]));
  const rows = new Map<string, QuantityRow>();
  for (const body of quantityBodies(bodies)) {
    const type = body.partTypeId ? types.get(body.partTypeId) : undefined;
    const key = type?.id ?? '';
    let row = rows.get(key);
    if (!row) {
      row = {
        type,
        name: type?.name ?? 'Ei tyyppiä',
        unit: type?.unit ?? 'count',
        parts: [],
        count: 0,
        total: 0,
        missing: 0,
        batches: [],
      };
      rows.set(key, row);
    }
    const basis = row.unit === 'count' ? undefined : quantityBasis(body, meshById.get(body.id));
    const blank = project.settings.cutting?.parts?.[body.id]?.blank;
    const dimensions = blank
      ? blank.geometryKey === cutGeometryKey(body)
        ? orderedQuantityBasis(blank).dimensions
        : undefined
      : basis?.dimensions;
    const length = dimensions?.[0],
      width = dimensions?.[1];
    const value =
      row.unit === 'count'
        ? 1
        : length && length > 0 && (row.unit === 'length' || (width && width > 0))
          ? row.unit === 'length'
            ? length / 1000
            : (length * width!) / 1e6
          : undefined;
    const issue =
      value === undefined
        ? body.quantityBasis || blank
          ? 'Muoto muuttui. Tarkista aihion mitat.'
          : 'Vahvista aihion mitat.'
        : undefined;
    row.parts.push({
      body,
      dimensions,
      value,
      issue,
      manual: !!basis?.manual || !!blank,
    });
    row.count++;
    if (value === undefined) row.missing++;
    else row.total += value;
  }
  for (const row of rows.values()) {
    if (row.unit === 'count') continue;
    const batches = new Map<string, QuantityRow['batches'][number]>();
    for (const part of row.parts) {
      if (part.value === undefined || !part.dimensions) continue;
      const dimensions = part.dimensions
        .slice(0, row.unit === 'length' ? 1 : 2)
        .map((d) => Math.round(d * 1000) / 1000);
      const key = dimensions.join('x');
      const batch = batches.get(key) ?? { dimensions, count: 0, total: 0 };
      batch.count++;
      batch.total += part.value;
      batches.set(key, batch);
    }
    row.batches = [...batches.values()].sort(
      (a, b) =>
        b.dimensions[0] - a.dimensions[0] || (b.dimensions[1] ?? 0) - (a.dimensions[1] ?? 0),
    );
  }
  return [...rows.values()].sort((a, b) =>
    a.type && b.type ? a.name.localeCompare(b.name, 'fi') : a.type ? -1 : 1,
  );
}

/** Replacing a roundover changes topology, not the blank that is bought/cut.
 * Carry explicit cutting-list allowances through the same edit and linked copies. */
export function preserveDetailBlanks(before: Project, after: Project): Project {
  const cutting = after.settings.cutting;
  if (!cutting?.parts || before.id !== after.id) return after;
  const previous = new Map(before.bodies.map((b) => [b.id, b]));
  const changed = new Set<string>(),
    families = new Set<string>();
  for (const body of after.bodies) {
    const old = previous.get(body.id),
      treatment = body.edgeTreatment;
    if (!old || !treatment || cutGeometryKey(old) === cutGeometryKey(body)) continue;
    const source = cutGeometryKey({ ...body, feature: treatment.source });
    if (
      source === cutGeometryKey(old) ||
      (old.edgeTreatment?.id === treatment.id &&
        source === cutGeometryKey({ ...old, feature: old.edgeTreatment.source }))
    ) {
      changed.add(body.id);
      if (body.component) families.add(body.component.id);
    }
  }
  let updated = false;
  const parts = { ...cutting.parts };
  for (const body of after.bodies) {
    const old = previous.get(body.id),
      entry = parts[body.id];
    if (!entry?.blank) continue;
    // Recover older files only when the saved blank matches the exact source
    // of this edge treatment. Unrelated stale allowances still need review.
    const knownSource =
      body.edgeTreatment &&
      entry.blank.geometryKey === cutGeometryKey({ ...body, feature: body.edgeTreatment.source });
    const oldBasis = old?.quantityBasis,
      nextBasis = body.quantityBasis;
    const retainedStock =
      old &&
      oldBasis &&
      nextBasis &&
      oldBasis.geometryKey === cutGeometryKey(old) &&
      nextBasis.geometryKey === cutGeometryKey(body) &&
      orderedQuantityBasis(oldBasis).dimensions.every(
        (n, i) => Math.abs(n - orderedQuantityBasis(nextBasis).dimensions[i]) < 1e-6,
      );
    if (
      !knownSource &&
      (!old ||
        entry.blank.geometryKey !== cutGeometryKey(old) ||
        !(
          retainedStock ||
          changed.has(body.id) ||
          (body.component && families.has(body.component.id))
        ))
    )
      continue;
    const key = cutGeometryKey(body);
    if (entry.blank.geometryKey === key) continue;
    parts[body.id] = { ...entry, blank: { ...entry.blank, geometryKey: key } };
    updated = true;
  }
  return updated
    ? { ...after, settings: { ...after.settings, cutting: { ...cutting, parts } } }
    : after;
}

export function assignPartType(
  project: Project,
  ids: string[],
  typeId?: string,
  meshes: BodyMesh[] = [],
): Project {
  const type = project.partTypes?.find((t) => t.id === typeId);
  if (typeId && !type) throw new Error('Valittua osatyyppiä ei löydy.');
  const selected = new Set(ids);
  const parts = quantityBodies(project.bodies.filter((b) => selected.has(b.id)));
  requireMovable(parts, project.groups);
  const eligible = new Set(parts.map((b) => b.id));
  const meshById = new Map(meshes.map((m) => [m.id, m]));
  return {
    ...project,
    bodies: project.bodies.map((b) => {
      if (!eligible.has(b.id)) return b;
      const blank = project.settings.cutting?.parts?.[b.id]?.blank;
      return {
        ...b,
        partTypeId: typeId,
        quantityBasis:
          type && type.unit !== 'count'
            ? blank?.geometryKey === cutGeometryKey(b)
              ? orderedQuantityBasis({ ...blank, manual: true })
              : (quantityBasis(b, meshById.get(b.id)) ?? b.quantityBasis)
            : b.quantityBasis,
      };
    }),
  };
}

export function savePartType(
  project: Project,
  input: Omit<PartType, 'id'> & { id?: string },
): Project {
  const result = partTypeSchema.safeParse({ ...input, id: input.id ?? uid() });
  if (!result.success) throw new Error('Anna tyypille nimi (1–80 merkkiä) ja laskentatapa.');
  const type = result.data,
    types = project.partTypes ?? [];
  if (types.some((t) => t.id !== type.id && typeNameKey(t.name) === typeNameKey(type.name)))
    throw new Error('Tämänniminen tyyppi on jo olemassa. Valitse se listasta.');
  if (!input.id && types.length >= 1000)
    throw new Error('Projektissa voi olla enintään 1 000 osatyyppiä.');
  return {
    ...project,
    partTypes: types.some((t) => t.id === type.id)
      ? types.map((t) => (t.id === type.id ? type : t))
      : [...types, type],
  };
}

export function removePartType(project: Project, typeId: string): Project {
  const parts = project.bodies.filter((b) => b.partTypeId === typeId);
  if (parts.length) requireMovable(parts, project.groups);
  return {
    ...project,
    partTypes: project.partTypes?.filter((t) => t.id !== typeId),
    bodies: project.bodies.map((b) =>
      b.partTypeId === typeId ? { ...b, partTypeId: undefined } : b,
    ),
  };
}

export function setQuantityDimensions(project: Project, id: string, dimensions?: Vec3): Project {
  const body = project.bodies.find((b) => b.id === id);
  if (!body) throw new Error('Valittua osaa ei löydy.');
  const linked = project.bodies.filter(
    (b) => b.id === id || (body?.component && b.component?.id === body.component.id),
  );
  requireMovable(linked, project.groups);
  const type = project.partTypes?.find((t) => t.id === body.partTypeId);
  if (
    dimensions &&
    (dimensions.some((n) => !Number.isFinite(n) || n < 0 || n > 100000) ||
      dimensions[0] <= 0 ||
      (type?.unit === 'area' && dimensions[1] <= 0))
  )
    throw new Error(
      'Anna positiivinen pituus ja neliölaskentaan myös leveys (enintään 100 000 mm).',
    );
  const cutting = project.settings.cutting;
  const parts = cutting?.parts && { ...cutting.parts };
  for (const b of linked) {
    if (!parts?.[b.id]?.blank) continue;
    parts[b.id] = {
      ...parts[b.id],
      blank: dimensions?.every((n) => n >= 0.1)
        ? orderedQuantityBasis({ dimensions, geometryKey: cutGeometryKey(b) })
        : undefined,
    };
  }
  return {
    ...project,
    settings:
      cutting && parts ? { ...project.settings, cutting: { ...cutting, parts } } : project.settings,
    bodies: project.bodies.map((b) =>
      linked.includes(b)
        ? {
            ...b,
            quantityBasis: dimensions
              ? orderedQuantityBasis({ dimensions, geometryKey: cutGeometryKey(b), manual: true })
              : undefined,
          }
        : b,
    ),
  };
}

/** Cutting and quantity panels edit the same blank; other per-instance settings stay local. */
export function setCuttingSettings(project: Project, cutting: CutSettings): Project {
  let result: Project = { ...project, settings: { ...project.settings, cutting } };
  for (const body of project.bodies) {
    const old = project.settings.cutting?.parts?.[body.id]?.blank;
    const next = cutting.parts?.[body.id]?.blank;
    if (JSON.stringify(old) !== JSON.stringify(next))
      result = setQuantityDimensions(result, body.id, next?.dimensions);
  }
  return result;
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
};
export function quantitiesCSV(rows: QuantityRow[]) {
  return (
    '\uFEFF' +
    [
      [
        'Tyyppi',
        'Kappaleita',
        'Vahvistettu määrä',
        'Yksikkö',
        'Laskentaperuste',
        'Tarkistettavia osia',
        'Erittely',
      ],
      ...rows.map((r) => [
        r.name,
        r.count,
        String(Math.round(r.total * 1e9) / 1e9).replace('.', ','),
        quantityUnits[r.unit],
        quantityMethods[r.unit],
        r.missing,
        r.batches
          .map((b) => `${b.count} × ${b.dimensions.map(quantityNumber).join(' × ')} mm`)
          .join(' / '),
      ]),
    ]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n')
  );
}
