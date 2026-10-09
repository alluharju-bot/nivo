import { annotationText } from '../model/annotationStyle';
import type { SectionResult } from '../cad/protocol';
import type { Project } from '../model/project';
import {
  sectionBodySignature,
  sectionDistance,
  type Section,
  type SectionAnchor,
} from '../model/sections';
import { toUV } from '../model/sketch';
import { escapeXml, type Sheet, type DrawingArea } from './svg';
import { formatLength } from '../model/units';

export function sectionPoint(section: Section, anchor: SectionAnchor): [number, number] {
  const uv = toUV(anchor.point, section.frame);
  return [uv[0] * (section.flipped ? -1 : 1), -uv[1]];
}
export function sectionDimensionGeometry(
  section: Section,
  dimension: Section['dimensions'][number],
) {
  const start = sectionPoint(section, dimension.start),
    end = sectionPoint(section, dimension.end);
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    length = Math.hypot(dx, dy);
  const normal: [number, number] =
    dimension.axis === 'horizontal'
      ? [0, 1]
      : dimension.axis === 'vertical'
        ? [1, 0]
        : [-dy / (length || 1), dx / (length || 1)];
  const a: [number, number] =
    dimension.axis === 'horizontal'
      ? [start[0], (start[1] + end[1]) / 2 + dimension.offset]
      : dimension.axis === 'vertical'
        ? [(start[0] + end[0]) / 2 + dimension.offset, start[1]]
        : [start[0] + normal[0] * dimension.offset, start[1] + normal[1] * dimension.offset];
  const b: [number, number] =
    dimension.axis === 'horizontal'
      ? [end[0], a[1]]
      : dimension.axis === 'vertical'
        ? [a[0], end[1]]
        : [end[0] + normal[0] * dimension.offset, end[1] + normal[1] * dimension.offset];
  return {
    start,
    end,
    a,
    b,
    value:
      dimension.axis === 'horizontal'
        ? Math.abs(dx)
        : dimension.axis === 'vertical'
          ? Math.abs(dy)
          : length,
  };
}
export function validSectionDimensions(project: Project, section: Section, result: SectionResult) {
  const signatures = new Map(project.bodies.map((b) => [b.id, sectionBodySignature(b)]));
  const points = new Map<string, SectionAnchor[]>();
  result.anchors.forEach((a) => {
    const list = points.get(a.bodyId) ?? [];
    list.push(a);
    points.set(a.bodyId, list);
  });
  return new Map(
    section.dimensions.map((d) => [
      d.id,
      [d.start, d.end].every(
        (a) =>
          signatures.get(a.bodyId) === a.signature &&
          Math.abs(sectionDistance(section, a.point)) < 1e-4 &&
          points
            .get(a.bodyId)
            ?.some((p) => Math.hypot(...p.point.map((n, i) => n - a.point[i])) < 1e-4),
      ),
    ]),
  );
}
export function sectionSheet(
  project: Project,
  section: Section,
  result: SectionResult,
  scale: number,
  hidden = false,
  fixed?: { x: number; y: number },
  area: DrawingArea = { x: 16, y: 20.5, width: 265, height: 155 },
): Sheet {
  const projection = result.projection ?? { visible: [], hidden: [], viewBox: [0, 0, 1, 1] };
  const valid = validSectionDimensions(project, section, result),
    visibleDimensions = section.dimensions.filter(
      (d) => !d.hidden && !project.settings.measurementsHidden,
    ),
    orphanCount = visibleDimensions.filter((d) => !valid.get(d.id)).length;
  let [minX, minY, w, h] = projection.viewBox,
    maxX = minX + w,
    maxY = minY + h;
  for (const d of visibleDimensions) {
    const g = sectionDimensionGeometry(section, d);
    for (const p of [g.start, g.end, g.a, g.b]) {
      minX = Math.min(minX, p[0] - 15 * scale);
      maxX = Math.max(maxX, p[0] + 15 * scale);
      minY = Math.min(minY, p[1] - 5 * scale);
      maxY = Math.max(maxY, p[1] + 5 * scale);
    }
  }
  const x = fixed?.x ?? area.x + area.width / 2 - (minX + maxX) / 2 / scale,
    y = fixed?.y ?? area.y + area.height / 2 - (minY + maxY) / 2 / scale;
  const fits = (maxX - minX) / scale <= area.width && (maxY - minY) / scale <= area.height;
  const n = (v: number) => Number(v.toFixed(5));
  const paths = (list: string[]) => list.map((d) => `<path d="${escapeXml(d)}"/>`).join('');
  const annotations = visibleDimensions
    .map((d) => {
      const g = sectionDimensionGeometry(section, d),
        [s, e, a, b] = [g.start, g.end, g.a, g.b].map((p) => [
          n(x + p[0] / scale),
          n(y + p[1] / scale),
        ]);
      const broken = !valid.get(d.id),
        label = broken ? 'Viite muuttunut' : annotationText(d, g.value, formatLength(g.value));
      return `<g data-section-dimension="${escapeXml(d.id)}" data-mm="${n(g.value)}" fill="none" stroke="${broken ? '#ac382c' : '#344333'}" stroke-width="0.2"><path d="M${s}L${a}L${b}L${e}"/><path d="M${a[0] - 1} ${a[1] + 1}l2 -2 M${b[0] - 1} ${b[1] + 1}l2 -2"/><text x="${n((a[0] + b[0]) / 2)}" y="${n((a[1] + b[1]) / 2 - 1.5)}" text-anchor="middle" stroke="none" fill="${broken ? '#ac382c' : '#253222'}" font-size="3">${escapeXml(label)}</text></g>`;
    })
    .join('');
  const content = `<defs><pattern id="section-hatch-${escapeXml(section.id)}" patternUnits="userSpaceOnUse" width="${2.5 * scale}" height="${2.5 * scale}"><path d="M0 ${2.5 * scale}L${2.5 * scale} 0" stroke="#786950" stroke-width="${0.15 * scale}"/></pattern></defs><g font-family="Arial, sans-serif"><g transform="translate(${n(x)} ${n(y)}) scale(${1 / scale})" fill="none" stroke="#354130" stroke-width="${0.22 * scale}" stroke-linejoin="round">${hidden ? `<g stroke="#929b8b" stroke-dasharray="${1.5 * scale} ${scale}">${paths(projection.hidden)}</g>` : ''}${paths(projection.visible)}${result.caps.map((c) => `<path data-section-body="${escapeXml(c.bodyId)}" d="${escapeXml(c.paths.join(' '))}" fill="url(#section-hatch-${escapeXml(section.id)})" fill-rule="evenodd" stroke-width="${0.45 * scale}"/>`).join('')}</g>${annotations}</g>`;
  return {
    content,
    fits,
    orphanCount,
    transform: { x, y, scale },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><rect width="297" height="210" fill="white"/>${content}<g font-family="Arial, sans-serif"><path d="M12 184H285" stroke="#8e9787" stroke-width=".2"/><text x="12" y="192" font-size="4" fill="#253222">${escapeXml(project.name)} · Leikkaus ${escapeXml(section.name)}</text><text x="285" y="192" text-anchor="end" font-size="3.5" fill="#253222">1:${scale} · mm</text><text x="12" y="201" font-size="2.5" fill="#747d6f">Tulosta todellisessa koossa · 100 % · Nivo</text></g></svg>`,
  };
}
