import { dimensionSvg, dimensionLabelBounds } from './dimensionGraphics';
import { markupSvg } from '../viewport/markupSvg';
import { markupPoints, markupLabel, markupLabelPosition } from '../model/markups';
import { annotationText } from '../model/annotationStyle';
import { pointDimensionGeometry, pointDimensionInView } from '../model/dimensions';
import {
  isPointDimension,
  bounds,
  corners,
  dimensionValue,
  dimensionEnvelope,
  type Project,
  type Vec3,
} from '../model/project';
import type { DrawingView, Projection } from '../cad/protocol';
import { formatLength } from '../model/units';

import { drawingFrame, viewLabels, projectDrawingPoint } from '../model/drawingViews';
export { viewLabels };
export const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (value: number) => Number(value.toFixed(5));
export const projectPoint = projectDrawingPoint;

interface DimensionPlacement {
  id: string;
  bodyId: string;
  name: string;
  value: number;
  label: string;
  horizontal: boolean;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  lane: number;
  rotation: number;
  gap: number;
  thickness: number;
}
/** Reuse lanes only for non-overlapping dimensions, including their printed text. */
function dimensionLayout(project: Project, view: DrawingView, scale: number) {
  const rows: DimensionPlacement[] = [];
  const lanes: [number, number][][][] = [[], []];
  let orphanCount = 0;
  for (const dimension of project.dimensions) {
    if (dimension.hidden || project.settings.measurementsHidden) continue;
    if (isPointDimension(dimension)) {
      if (pointDimensionGeometry(project.bodies, dimension).orphan) orphanCount++;
      continue;
    }
    const body = dimensionEnvelope(project, dimension);
    if (!body) {
      orphanCount++;
      continue;
    }
    if (body.purpose === 'construction') continue;
    const value = dimensionValue(project, dimension)!;
    const horizontal = dimension.axis === drawingFrame(view).horizontal;
    const vertical = dimension.axis === drawingFrame(view).vertical;
    if ((!horizontal && !vertical) || value <= 0) continue;
    const pts = corners(body).map((p) => projectPoint(p, view).map((n) => n / scale));
    const x1 = Math.min(...pts.map((p) => p[0])),
      x2 = Math.max(...pts.map((p) => p[0]));
    const y1 = Math.min(...pts.map((p) => p[1])),
      y2 = Math.max(...pts.map((p) => p[1]));
    const lo = horizontal ? x1 : y1,
      hi = horizontal ? x2 : y2;
    const label = annotationText(dimension, value, formatLength(value));
    const rotation = dimension.labelRotation ?? 0;
    const textBox = dimensionLabelBounds(label.length, rotation);
    const middle = (lo + hi) / 2,
      textHalf = (horizontal ? textBox.width : textBox.height) / 2;
    const interval: [number, number] = [
      Math.min(lo, middle - textHalf) - 3,
      Math.max(hi, middle + textHalf) + 3,
    ];
    const group = lanes[horizontal ? 0 : 1];
    let lane = group.findIndex((occupied) =>
      occupied.every(([a, b]) => interval[1] < a || interval[0] > b),
    );
    if (lane === -1) {
      lane = group.length;
      group.push([]);
    }
    group[lane].push(interval);
    rows.push({
      id: dimension.id,
      bodyId: body.id,
      name: body.name,
      value,
      label,
      rotation,
      gap: 0,
      thickness: horizontal ? textBox.height : textBox.width,
      horizontal,
      x1,
      x2,
      y1,
      y2,
      lane,
    });
  }
  const extent = (horizontal: boolean) => {
    const members = rows.filter((row) => row.horizontal === horizontal);
    let outside = 3;
    for (let lane = 0; lane < lanes[horizontal ? 0 : 1].length; lane++) {
      const group = members.filter((row) => row.lane === lane);
      const thickness = Math.max(...group.map((row) => row.thickness));
      const gap = Math.max(9, outside + thickness / 2);
      group.forEach((row) => (row.gap = gap));
      outside = gap + thickness / 2 + 3;
    }
    return members.length ? outside : 0;
  };
  return { rows, orphanCount, left: extent(false), bottom: extent(true) };
}
function annotationBounds(
  project: Project,
  view: DrawingView,
  scale: number,
  box: [number, number, number, number],
) {
  let [x, y, w, h] = box,
    right = x + w,
    bottom = y + h;
  for (const d of project.dimensions.filter(isPointDimension)) {
    if (
      d.hidden ||
      project.settings.measurementsHidden ||
      !pointDimensionInView(project.bodies, d, view)
    )
      continue;
    const g = pointDimensionGeometry(project.bodies, d),
      points = [g.start, g.end, g.a, g.b].map((p) => projectPoint(p, view));
    const padding = (annotationText(d, g.value, formatLength(g.value)).length * 0.95 + 4) * scale;
    for (const p of points) {
      x = Math.min(x, p[0] - padding);
      right = Math.max(right, p[0] + padding);
      y = Math.min(y, p[1] - padding);
      bottom = Math.max(bottom, p[1] + padding);
    }
  }
  for (const m of project.settings.markupsHidden ? [] : (project.annotations ?? [])) {
    if (m.hidden) continue;
    if (
      m.kind !== 'note' &&
      Math.abs(m.frame.normal.reduce((s, n, i) => s + n * drawingFrame(view).normal[i], 0)) < 1e-6
    )
      continue;
    for (const point of markupPoints(m, project.bodies)) {
      const p = projectPoint(point, view);
      x = Math.min(x, p[0]);
      right = Math.max(right, p[0]);
      y = Math.min(y, p[1]);
      bottom = Math.max(bottom, p[1]);
    }
    const p = projectPoint(markupLabelPosition(m, project.bodies), view),
      label = markupLabel(m);
    const halfWidth = (label.width * 0.125 + 2) * scale,
      halfHeight = (label.height * 0.125 + 2) * scale;
    x = Math.min(x, p[0] - halfWidth);
    right = Math.max(right, p[0] + halfWidth);
    y = Math.min(y, p[1] - halfHeight);
    bottom = Math.max(bottom, p[1] + halfHeight);
  }
  return [x, y, right - x, bottom - y] as const;
}
export function recommendedScale(project: Project, view: DrawingView): number {
  const { min, max } = bounds(project.bodies.filter((b) => b.purpose !== 'construction'));
  const a = projectPoint(min, view),
    b = projectPoint(max, view);
  return (
    [1, 2, 5, 10, 20, 50, 100, 500, 1000].find((scale) => {
      const layout = dimensionLayout(project, view, scale);
      const box = annotationBounds(project, view, scale, [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.abs(b[0] - a[0]),
        Math.abs(b[1] - a[1]),
      ]);
      return box[2] / scale + layout.left <= 253 && box[3] / scale + layout.bottom <= 130;
    }) ?? 1000
  );
}
export interface DrawingArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Sheet {
  content?: string;
  svg: string;
  fits: boolean;
  orphanCount: number;
  transform: { x: number; y: number; scale: number };
}
export function createSheet(
  project: Project,
  projection: Projection,
  view: DrawingView,
  scale: number,
  hidden = false,
  area: DrawingArea = { x: 22, y: 34.5, width: 253, height: 130 },
): Sheet {
  const [bx, by, bw, bh] = projection.viewBox;
  const layout = dimensionLayout(project, view, scale);
  const box = annotationBounds(project, view, scale, [bx, by, bw, bh]);
  const tx = area.x + area.width / 2 + layout.left / 2 - (box[0] + box[2] / 2) / scale,
    ty = area.y + area.height / 2 - layout.bottom / 2 - (box[1] + box[3] / 2) / scale;
  const fits =
    box[2] / scale + layout.left <= area.width && box[3] / scale + layout.bottom <= area.height;
  const { orphanCount } = layout;
  const lines: string[] = [];
  for (const d of layout.rows) {
    const x1 = d.x1 + tx,
      x2 = d.x2 + tx,
      y1 = d.y1 + ty,
      y2 = d.y2 + ty;
    const label = escapeXml(d.label);
    const group = `<g data-dimension="${escapeXml(d.id)}" data-body="${escapeXml(d.bodyId)}" data-mm="${n(d.value)}"><title>${escapeXml(d.name)} · ${label} mm</title>`;
    const a = d.horizontal ? [x1, ty + (by + bh) / scale + d.gap] : [tx + bx / scale - d.gap, y1];
    const b = d.horizontal ? [x2, a[1]] : [a[0], y2];
    lines.push(
      `${group}${dimensionSvg(
        [x1, d.horizontal ? y2 : y1],
        [d.horizontal ? x2 : x1, y2],
        a,
        b,
        label,
        d.label.length,
        d.rotation,
        project.settings.dimensionLineStyle,
      )}</g>`,
    );
  }
  for (const d of project.dimensions.filter(isPointDimension)) {
    if (
      d.hidden ||
      project.settings.measurementsHidden ||
      !pointDimensionInView(project.bodies, d, view)
    )
      continue;
    const g = pointDimensionGeometry(project.bodies, d);
    const [start, end, a, b] = [g.start, g.end, g.a, g.b].map((p) => {
      const q = projectPoint(p, view);
      return [q[0] / scale + tx, q[1] / scale + ty];
    });
    const label = annotationText(d, g.value, formatLength(g.value));
    lines.push(
      `<g data-dimension="${escapeXml(d.id)}" data-mm="${n(g.value)}">${dimensionSvg(
        start,
        end,
        a,
        b,
        escapeXml(label),
        label.length,
        d.labelRotation,
        project.settings.dimensionLineStyle,
      )}</g>`,
    );
  }
  const paths = (list: string[]) => list.map((d) => `<path d="${escapeXml(d)}"/>`).join('');
  const markupContent = markupSvg(
    project.settings.markupsHidden ? [] : (project.annotations ?? []),
    project.bodies,
    (p) => {
      const q = projectPoint(p, view);
      return [q[0] / scale + tx, q[1] / scale + ty, 0];
    },
    [],
    0.25,
  );
  const content = `  <g transform="translate(${n(tx)} ${n(ty)}) scale(${1 / scale})" fill="none" stroke="#243630" stroke-width="${0.35 * scale}" stroke-linejoin="round">
    ${hidden ? `<g stroke="#7c8580" stroke-width="${0.18 * scale}" stroke-dasharray="${2 * scale} ${scale}">${paths(projection.hidden)}</g>` : ''}
    ${paths(projection.visible)}
  </g>${markupContent}
  <g fill="none" color="#243630" stroke="#475a51" stroke-width="0.25" stroke-linecap="round">${lines.join('')}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210" role="img" aria-label="${viewLabels[view]}, mittakaava 1:${scale}">
  <rect width="297" height="210" fill="white"/>
  <g fill="none" stroke="#243630" stroke-width="0.2"><rect x="10" y="10" width="277" height="190"/><path d="M10 177H287 M205 177V200 M250 177V200"/></g>
  <g font-family="Arial, sans-serif" fill="#243630"><text x="18" y="22" font-size="3" letter-spacing="0.7">NIVO / MITTAKUVA</text><text x="279" y="22" font-size="3" text-anchor="end">${viewLabels[view]} · mm</text></g>
  ${content}
  <g font-family="Arial, sans-serif" fill="#243630"><text x="15" y="183" font-size="2.2" fill="#6d7872">PROJEKTI</text><text x="15" y="190" font-size="4.2">${escapeXml(project.name)}</text><text x="15" y="196" font-size="2.5">Tulosta 100 % koossa. Älä sovita sivulle.</text><text x="210" y="183" font-size="2.2" fill="#6d7872">MITTAKAAVA / ARKKI</text><text x="210" y="190" font-size="4">1:${scale}</text><text x="210" y="196" font-size="2.5">A4 · 297 × 210 mm</text><text x="255" y="183" font-size="2.2" fill="#6d7872">PÄIVÄYS</text><text x="255" y="190" font-size="3">${escapeXml(project.updatedAt.slice(0, 10))}</text><text x="255" y="196" font-size="2.5">${viewLabels[view]}</text></g>
  </svg>`;
  return { svg, content, fits, orphanCount, transform: { x: tx, y: ty, scale } };
}
