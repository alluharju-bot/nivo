import type { Project } from '../model/project';
import { sheetViewKey, type DrawingSheet, type SheetView } from '../model/drawingSheets';
import { drawingProject } from './selection';
import { createSheet, escapeXml, viewLabels, type DrawingArea, type Sheet } from './svg';
import { sectionSheet } from './sectionSvg';
import type { Projection, SectionResult } from '../cad/protocol';
/** Saved sheets retain a group or an explicit selection, never the transient current selection. */
export function sheetProject(project: Project, sheet: DrawingSheet) {
  const scope = sheet.scope;
  const target =
    scope.kind === 'group'
      ? `group:${scope.groupId}`
      : scope.kind === 'parts'
        ? 'selection'
        : 'all';
  const scoped = drawingProject(project, target, scope.kind === 'parts' ? scope.ids : []);
  const missing =
    scope.kind === 'parts'
      ? scope.ids.some((id) => !project.bodies.some((b) => b.id === id))
      : scope.kind === 'group' && !project.groups.some((g) => g.id === scope.groupId);
  return { project: scoped, missing: missing || scoped.bodies.length === 0 };
}

export type SheetProjection =
  { kind: 'standard'; projection: Projection } | { kind: 'section'; result: SectionResult };
export const sheetScales = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
export function sheetViewLabel(project: Project, view: SheetView) {
  return view.kind === 'standard'
    ? viewLabels[view.view]
    : `Leikkaus ${project.sections?.find((s) => s.id === view.sectionId)?.name ?? '(puuttuu)'}`;
}
/** Areas are in paper millimetres. Geometry is never rescaled to its cell independently. */
export function sheetAreas(count: number): DrawingArea[] {
  const columns = count <= 2 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / columns),
    gap = 8;
  const width = (261 - (columns - 1) * gap) / columns;
  const height = (140 - (rows - 1) * gap) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: 18 + (i % columns) * (width + gap),
    y: 32 + Math.floor(i / columns) * (height + gap),
    width,
    height: height - 8,
  }));
}
export function createMultiSheet(
  project: Project,
  definition: DrawingSheet,
  projections: Map<string, SheetProjection>,
  scale: number,
): Sheet {
  const { project: scoped, missing } = sheetProject(project, definition);
  const areas = sheetAreas(definition.views.length);
  let fits = !missing,
    orphanCount = 0;
  const content = definition.views
    .map((view, index) => {
      const area = areas[index],
        key = sheetViewKey(view),
        data = projections.get(key);
      let sheet: Sheet | undefined;
      if (view.kind === 'standard' && data?.kind === 'standard')
        sheet = createSheet(scoped, data.projection, view.view, scale, definition.hidden, area);
      if (view.kind === 'section' && data?.kind === 'section') {
        const section = project.sections?.find((s) => s.id === view.sectionId);
        if (section) {
          const ids = new Set(scoped.bodies.map((b) => b.id));
          const dimensions =
            definition.scope.kind === 'visible'
              ? section.dimensions
              : section.dimensions.filter((d) => ids.has(d.start.bodyId) && ids.has(d.end.bodyId));
          sheet = sectionSheet(
            scoped,
            { ...section, dimensions },
            data.result,
            scale,
            definition.hidden,
            undefined,
            area,
          );
        }
      }
      if (!sheet) {
        fits = false;
        orphanCount++;
      } else {
        fits = fits && sheet.fits;
        orphanCount += sheet.orphanCount;
      }
      const label = escapeXml(sheetViewLabel(project, view));
      // Oversized views remain visibly clipped while exports are blocked.
      return `<g data-sheet-view="${escapeXml(key)}" data-scale="${scale}"><title>${label}</title><defs><clipPath id="sheet-cell-${index}"><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}"/></clipPath></defs><g clip-path="url(#sheet-cell-${index})">${sheet?.content ?? ''}</g><text x="${area.x + area.width / 2}" y="${area.y + area.height + 5}" text-anchor="middle" font-size="3" fill="${sheet?.fits ? '#475a51' : '#ac382c'}">${label}${sheet ? (sheet.fits ? '' : ' · ei mahdu') : ' · puuttuu'}</text></g>`;
    })
    .join('');
  const scopeName =
    definition.scope.kind === 'group'
      ? (project.groups.find(
          (g) => definition.scope.kind === 'group' && g.id === definition.scope.groupId,
        )?.name ?? 'Puuttuva ryhmä')
      : `${scoped.bodies.length} osaa`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210" role="img" aria-label="${escapeXml(definition.name)}, mittakaava 1:${scale}"><rect width="297" height="210" fill="white"/><g font-family="Arial, sans-serif" fill="#243630"><rect x="10" y="10" width="277" height="190" fill="none" stroke="#243630" stroke-width=".2"/><text x="18" y="22" font-size="3" letter-spacing=".7">NIVO / MITTA-ARKKI</text><text x="279" y="22" font-size="3" text-anchor="end">${escapeXml(scopeName)} · mm</text>${content}<path d="M10 178H287 M215 178V200" fill="none" stroke="#243630" stroke-width=".2"/><text x="16" y="185" font-size="2.6">${escapeXml(project.name)}</text><text x="16" y="192" font-size="4">${escapeXml(definition.name)}</text><text x="16" y="197" font-size="2.4">Tulosta 100 % koossa. Älä sovita sivulle.</text><text x="222" y="186" font-size="4">1:${scale} · A4</text><text x="222" y="194" font-size="2.8">${escapeXml(project.updatedAt.slice(0, 10))}</text></g></svg>`;
  return { svg, content, fits, orphanCount, transform: { x: 0, y: 0, scale } };
}
export function multiSheetScale(
  project: Project,
  definition: DrawingSheet,
  projections: Map<string, SheetProjection>,
) {
  return (
    sheetScales.find((s) => createMultiSheet(project, definition, projections, s).fits) ?? 1000
  );
}
