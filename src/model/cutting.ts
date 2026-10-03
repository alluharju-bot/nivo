import type { Body, Project, Vec3 } from './project';
import type { BodyMesh } from '../cad/protocol';
import { dot, sub, unit } from './geometry';
import { findPreset } from './materials';
import { groupPath } from './groups';
import { cutSettingsSchema, type CutSettings } from './cutSettings';

export type CutPart = {
  id: string;
  number: number;
  name: string;
  group: string;
  material: string;
  materialKey: string;
  color: string;
  dimensions?: [number, number, number]; // length, width, thickness in the part's frame
  grain: 'free' | 'length' | 'width'; // direction aligned with the stock's length
  included: boolean;
  manual: boolean;
  issue?: string;
};
export type CutRect = { x: number; y: number; width: number; height: number };
export type CutPlacement = CutRect & { part: CutPart; rotated: boolean };
export type CutSheet = {
  number: number;
  material: string;
  materialKey: string;
  color: string;
  thickness: number;
  placements: CutPlacement[];
  remainders: CutRect[];
};
export type CutPlan = {
  sheets: CutSheet[];
  unplaced: { part: CutPart; reason: string }[];
  excluded: CutPart[];
  usedArea: number;
  stockArea: number;
};
const clean = (n: number) => Math.round(n * 1e6) / 1e6;
const EPS = 1e-7;

/** A saved manual blank must be checked again after the geometry changes. */
export function cutGeometryKey(body: Body) {
  const f = body.feature;
  if (f.type === 'brep') return `brep:${f.topologyId}`;
  // A compact deterministic signature, excluding position and appearance.
  let hash = 2166136261;
  for (const c of JSON.stringify(f)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${f.type}:${hash >>> 0}`;
}

/** Recognise a true cuboid using exact planar normals, CAD vertices and volume.
 * World-axis bounding boxes and tessellated curved extents are never cut sizes.
 * Coplanar face splits are fine; holes, hollow bodies and curved parts require
 * explicit blank dimensions instead of silently being flattened into panels.
 */
export function rectangularCutSize(body: Body, mesh?: BodyMesh): CutPart['dimensions'] {
  if (body.feature.type === 'rectangle-extrusion')
    return [body.feature.width, body.feature.depth, body.feature.height]
      .sort((a, b) => b - a)
      .map(clean) as [number, number, number];
  if (!mesh || !mesh.verticesCAD.length || mesh.faces.some((f) => !f.planar)) return;
  const axes: Vec3[] = [];
  for (const face of mesh.faces) {
    const n = unit(face.normal);
    if (!axes.some((a) => Math.abs(dot(a, n)) > 1 - 1e-8)) axes.push(n);
  }
  if (
    axes.length !== 3 ||
    axes.some((a, i) => axes.slice(i + 1).some((b) => Math.abs(dot(a, b)) > 1e-8))
  )
    return;
  const origin = mesh.verticesCAD[0].point;
  const sizes = axes.map((axis) => {
    const coords = mesh.verticesCAD.map((v) => dot(sub(v.point, origin), axis));
    return Math.max(...coords) - Math.min(...coords);
  });
  const volume = sizes.reduce((a, b) => a * b, 1);
  if (
    sizes.some((s) => s < 0.1 - EPS) ||
    Math.abs(volume - mesh.volume) > Math.max(0.001, volume * 1e-8)
  )
    return;
  return sizes.sort((a, b) => b - a).map(clean) as [number, number, number];
}

export function cuttingParts(
  project: Project,
  bodies: Body[],
  meshes: BodyMesh[],
  settings: CutSettings,
): CutPart[] {
  const byId = new Map(meshes.map((m) => [m.id, m]));
  return bodies.map((body, i) => {
    const override = settings.parts?.[body.id];
    const preset = findPreset(body.appearance?.preset ?? body.material ?? 'matte');
    const asset = body.appearance?.assetId;
    const outdated = !!override?.blank && override.blank.geometryKey !== cutGeometryKey(body);
    const dimensions = outdated
      ? undefined
      : (override?.blank?.dimensions ?? rectangularCutSize(body, byId.get(body.id)));
    return {
      id: body.id,
      number: i + 1,
      name: body.name,
      group: groupPath(project.groups, body.groupId),
      material:
        override?.stock ??
        [
          preset.name,
          body.color.toLowerCase() !== preset.color.toLowerCase() ? body.color.toUpperCase() : '',
          asset && project.assets?.[asset]?.name,
        ]
          .filter(Boolean)
          .join(' · '),
      // Different finishes must not silently share a sheet. An explicit stock
      // name lets the user deliberately combine parts from the same real stock.
      materialKey: override?.stock
        ? `stock:${override.stock}`
        : JSON.stringify([
            preset.id,
            body.color.toLowerCase(),
            asset ?? '',
            body.appearance?.maps ?? {},
          ]),
      color: body.color,
      dimensions,
      grain:
        override?.grain ??
        (asset || ['oak', 'walnut', 'birch', 'pine', 'brushed'].includes(preset.pattern ?? '')
          ? 'length'
          : 'free'),
      included: override?.included ?? true,
      manual: !!override?.blank,
      issue: outdated
        ? 'Muoto muuttui. Vahvista aihion mitat uudelleen.'
        : !dimensions
          ? 'Anna tämän muodon suorakulmaisen aihion mitat.'
          : undefined,
    };
  });
}

export function cutSettingsError(settings: CutSettings): string | undefined {
  if (!cutSettingsSchema.safeParse(settings).success)
    return 'Tarkista levykoko, sahausura (0–20 mm) ja reunavara (0–1 000 mm).';
  if (2 * settings.margin >= Math.min(settings.length, settings.width))
    return 'Reunavaran jälkeen levyyn pitää jäädä leikattavaa pinta-alaa.';
}

function orientations(part: CutPart) {
  const [length, width] = part.dimensions!;
  return [
    ...(part.grain !== 'width' ? [{ width: length, height: width, rotated: false }] : []),
    ...(part.grain !== 'length' && (part.grain === 'width' || length !== width)
      ? [{ width, height: length, rotated: true }]
      : []),
  ];
}

function pack(parts: CutPart[], settings: CutSettings, splitMode: number): CutSheet[] {
  const sheets: CutSheet[] = [];
  for (const part of parts) {
    let best:
      | {
          sheet: CutSheet;
          rectIndex: number;
          width: number;
          height: number;
          rotated: boolean;
          score: number[];
        }
      | undefined;
    const consider = (sheet: CutSheet) =>
      sheet.remainders.forEach((rect, rectIndex) => {
        for (const o of orientations(part)) {
          if (o.width > rect.width + EPS || o.height > rect.height + EPS) continue;
          const score = [
            Math.min(rect.width - o.width, rect.height - o.height),
            rect.width * rect.height - o.width * o.height,
          ];
          if (
            !best ||
            score[0] < best.score[0] - EPS ||
            (Math.abs(score[0] - best.score[0]) < EPS && score[1] < best.score[1])
          )
            best = { sheet, rectIndex, ...o, score };
        }
      });
    sheets.forEach(consider);
    if (!best) {
      const sheet: CutSheet = {
        number: 0,
        material: part.material,
        materialKey: part.materialKey,
        color: part.color,
        thickness: part.dimensions![2],
        placements: [],
        remainders: [
          {
            x: settings.margin,
            y: settings.margin,
            width: settings.length - 2 * settings.margin,
            height: settings.width - 2 * settings.margin,
          },
        ],
      };
      sheets.push(sheet);
      consider(sheet);
    }
    const { sheet, rectIndex, width, height, rotated } = best!;
    const rect = sheet.remainders.splice(rectIndex, 1)[0];
    sheet.placements.push({ part, x: rect.x, y: rect.y, width, height, rotated });
    const dw = rect.width - width - settings.kerf,
      dh = rect.height - height - settings.kerf;
    // Each split spans its whole free rectangle: the resulting layout can be
    // separated with straight guillotine cuts. Kerf is reserved BETWEEN parts,
    // never charged again outside a part which exactly fits the available edge.
    const horizontal = splitMode === 0 ? dw < dh : dw * height > dh * width;
    if (dw > EPS)
      sheet.remainders.push({
        x: rect.x + width + settings.kerf,
        y: rect.y,
        width: dw,
        height: horizontal ? height : rect.height,
      });
    if (dh > EPS)
      sheet.remainders.push({
        x: rect.x,
        y: rect.y + height + settings.kerf,
        width: horizontal ? rect.width : width,
        height: dh,
      });
  }
  return sheets;
}

/** Deterministic multi-start guillotine nesting, not a claim of global optimality.
 * Minimise sheet count, then retain the largest useful contiguous offcuts.
 */
export function createCutPlan(parts: CutPart[], settings: CutSettings): CutPlan {
  const error = cutSettingsError(settings);
  if (error) throw new Error(error);
  const plan: CutPlan = { sheets: [], unplaced: [], excluded: [], usedArea: 0, stockArea: 0 };
  const groups = new Map<string, CutPart[]>();
  for (const part of parts) {
    if (!part.included) {
      plan.excluded.push(part);
      continue;
    }
    if (!part.dimensions || part.issue) {
      plan.unplaced.push({ part, reason: part.issue ?? 'Aihion mitat puuttuvat.' });
      continue;
    }
    if (
      !orientations(part).some(
        (o) =>
          o.width <= settings.length - 2 * settings.margin + EPS &&
          o.height <= settings.width - 2 * settings.margin + EPS,
      )
    ) {
      plan.unplaced.push({
        part,
        reason:
          part.grain === 'free'
            ? 'Osa ei mahdu levylle reunavaroineen.'
            : 'Osa ei mahdu levylle valitulla syysuunnalla.',
      });
      continue;
    }
    const key = `${part.materialKey}:${clean(part.dimensions[2])}`;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  const metric = (sheets: CutSheet[]) =>
    sheets.reduce(
      (s, sheet) => s + sheet.remainders.reduce((a, r) => a + (r.width * r.height) ** 2, 0),
      0,
    );
  for (const group of groups.values()) {
    let best: CutSheet[] | undefined;
    let bestMetric = -Infinity;
    const scores = [
      (p: CutPart) => p.dimensions![0] * p.dimensions![1],
      (p: CutPart) => Math.max(p.dimensions![0], p.dimensions![1]),
      (p: CutPart) => Math.min(p.dimensions![0], p.dimensions![1]),
    ];
    for (const score of scores)
      for (const split of [0, 1]) {
        const sorted = [...group].sort((a, b) => score(b) - score(a) || a.number - b.number);
        const candidate = pack(sorted, settings, split),
          quality = metric(candidate);
        if (
          !best ||
          candidate.length < best.length ||
          (candidate.length === best.length && quality > bestMetric)
        ) {
          best = candidate;
          bestMetric = quality;
        }
      }
    plan.sheets.push(...best!);
  }
  plan.sheets.forEach((sheet, i) => {
    sheet.number = i + 1;
    for (const p of sheet.placements) plan.usedArea += p.width * p.height;
  });
  plan.stockArea = plan.sheets.length * settings.length * settings.width;
  return plan;
}
