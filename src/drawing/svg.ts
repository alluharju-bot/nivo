import { pointDimensionGeometry, pointDimensionInView } from '../model/dimensions';
import {
  isPointDimension,
  bounds,
  corners,
  dimensionValue,
  type Project,
  type Vec3,
} from '../model/project';
import type { DrawingView, Projection } from '../cad/protocol';
import { formatLength } from '../model/units';

export const viewLabels: Record<DrawingView, string> = {
  front: 'Etukuva',
  right: 'Sivukuva',
  top: 'Yläkuva',
};
export const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (value: number) => Number(value.toFixed(5));
export function projectPoint(point: Vec3, view: DrawingView): [number, number] {
  return view === 'front'
    ? [point[0], -point[2]]
    : view === 'right'
      ? [point[1], -point[2]]
      : [point[0], -point[1]];
}
interface DimensionPlacement {
  id: string;
  bodyId: string;
  name: string;
  value: number;
  horizontal: boolean;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  lane: number;
}
/** Reuse lanes only for non-overlapping dimensions, including their printed text. */
function dimensionLayout(project: Project, view: DrawingView, scale: number) {
  const rows: DimensionPlacement[] = [];
  const lanes: [number, number][][][] = [[], []];
  let orphanCount = 0;
  for (const dimension of project.dimensions) {
    if (isPointDimension(dimension)) {
      if (pointDimensionGeometry(project.bodies, dimension).orphan) orphanCount++;
      continue;
    }
    const body = project.bodies.find((b) => b.id === dimension.bodyId);
    if (!body) {
      orphanCount++;
      continue;
    }
    if (body.purpose === 'construction') continue;
    const value = dimensionValue(project, dimension)!;
    const horizontal = dimension.axis === (view === 'right' ? 'y' : 'x');
    const vertical = dimension.axis === (view === 'top' ? 'y' : 'z');
    if ((!horizontal && !vertical) || value <= 0) continue;
    const pts = corners(body).map((p) => projectPoint(p, view).map((n) => n / scale));
    const x1 = Math.min(...pts.map((p) => p[0])),
      x2 = Math.max(...pts.map((p) => p[0]));
    const y1 = Math.min(...pts.map((p) => p[1])),
      y2 = Math.max(...pts.map((p) => p[1]));
    const lo = horizontal ? x1 : y1,
      hi = horizontal ? x2 : y2;
    const middle = (lo + hi) / 2,
      textHalf = formatLength(value).length * 0.95;
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
      horizontal,
      x1,
      x2,
      y1,
      y2,
      lane,
    });
  }
  return {
    rows,
    orphanCount,
    left: lanes[1].length ? 15 + (lanes[1].length - 1) * 7 : 0,
    bottom: lanes[0].length ? 13 + (lanes[0].length - 1) * 7 : 0,
  };
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
    if (!pointDimensionInView(project.bodies, d, view)) continue;
    const g = pointDimensionGeometry(project.bodies, d),
      points = [g.start, g.end, g.a, g.b].map((p) => projectPoint(p, view));
    const padding = (formatLength(g.value).length * 0.95 + 4) * scale;
    for (const p of points) {
      x = Math.min(x, p[0] - padding);
      right = Math.max(right, p[0] + padding);
      y = Math.min(y, p[1] - padding);
      bottom = Math.max(bottom, p[1] + padding);
    }
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
export interface Sheet {
  svg: string;
  fits: boolean;
  orphanCount: number;
}
export function createSheet(
  project: Project,
  projection: Projection,
  view: DrawingView,
  scale: number,
  hidden = false,
): Sheet {
  const [bx, by, bw, bh] = projection.viewBox;
  const layout = dimensionLayout(project, view, scale);
  const box = annotationBounds(project, view, scale, [bx, by, bw, bh]);
  const tx = 148.5 + layout.left / 2 - (box[0] + box[2] / 2) / scale,
    ty = 99.5 - layout.bottom / 2 - (box[1] + box[3] / 2) / scale;
  const fits = box[2] / scale + layout.left <= 253 && box[3] / scale + layout.bottom <= 130;
  const { orphanCount } = layout;
  const lines: string[] = [];
  for (const d of layout.rows) {
    const x1 = d.x1 + tx,
      x2 = d.x2 + tx,
      y1 = d.y1 + ty,
      y2 = d.y2 + ty;
    const label = escapeXml(formatLength(d.value));
    const group = `<g data-dimension="${escapeXml(d.id)}" data-body="${escapeXml(d.bodyId)}" data-mm="${n(d.value)}"><title>${escapeXml(d.name)} · ${label} mm</title>`;
    if (d.horizontal) {
      const y = ty + (by + bh) / scale + 9 + d.lane * 7;
      lines.push(
        `${group}<path d="M${n(x1)} ${n(y2 + 1)}V${n(y + 2)} M${n(x2)} ${n(y2 + 1)}V${n(y + 2)} M${n(x1)} ${n(y)}H${n(x2)} M${n(x1 - 1)} ${n(y + 1.5)}l2 -3 M${n(x2 - 1)} ${n(y + 1.5)}l2 -3"/><text x="${n((x1 + x2) / 2)}" y="${n(y - 1.5)}">${label}</text></g>`,
      );
    } else {
      const x = tx + bx / scale - 9 - d.lane * 7;
      lines.push(
        `${group}<path d="M${n(x1 - 1)} ${n(y1)}H${n(x - 2)} M${n(x1 - 1)} ${n(y2)}H${n(x - 2)} M${n(x)} ${n(y1)}V${n(y2)} M${n(x - 1.5)} ${n(y1 + 1)}l3 -2 M${n(x - 1.5)} ${n(y2 + 1)}l3 -2"/><text transform="translate(${n(x - 1.5)} ${n((y1 + y2) / 2)}) rotate(-90)">${label}</text></g>`,
      );
    }
  }
  for (const d of project.dimensions.filter(isPointDimension)) {
    if (!pointDimensionInView(project.bodies, d, view)) continue;
    const g = pointDimensionGeometry(project.bodies, d);
    const [start, end, a, b] = [g.start, g.end, g.a, g.b].map((p) => {
      const q = projectPoint(p, view);
      return [q[0] / scale + tx, q[1] / scale + ty];
    });
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy),
      nx = -dy / length,
      ny = dx / length;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    lines.push(
      `<g data-dimension="${escapeXml(d.id)}" data-mm="${n(g.value)}"><path d="M${n(start[0])} ${n(start[1])}L${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(end[0])} ${n(end[1])} M${n(a[0] - nx)} ${n(a[1] - ny)}l${n(nx * 2)} ${n(ny * 2)} M${n(b[0] - nx)} ${n(b[1] - ny)}l${n(nx * 2)} ${n(ny * 2)}"/><text transform="translate(${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}) rotate(${n(angle)})" dy="-1.5">${escapeXml(formatLength(g.value))}</text></g>`,
    );
  }
  const paths = (list: string[]) => list.map((d) => `<path d="${escapeXml(d)}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210" role="img" aria-label="${viewLabels[view]}, mittakaava 1:${scale}">
  <rect width="297" height="210" fill="white"/>
  <g fill="none" stroke="#243630" stroke-width="0.2"><rect x="10" y="10" width="277" height="190"/><path d="M10 177H287 M205 177V200 M250 177V200"/></g>
  <g font-family="Arial, sans-serif" fill="#243630"><text x="18" y="22" font-size="3" letter-spacing="0.7">NIVO / MITTAKUVA</text><text x="279" y="22" font-size="3" text-anchor="end">${viewLabels[view]} · mm</text></g>
  <g transform="translate(${n(tx)} ${n(ty)}) scale(${1 / scale})" fill="none" stroke="#243630" stroke-width="${0.35 * scale}" stroke-linejoin="round">
    ${hidden ? `<g stroke="#7c8580" stroke-width="${0.18 * scale}" stroke-dasharray="${2 * scale} ${scale}">${paths(projection.hidden)}</g>` : ''}
    ${paths(projection.visible)}
  </g>
  <g fill="none" stroke="#475a51" stroke-width="0.18">${lines.join('').replaceAll('<text ', '<text fill="#243630" stroke="none" font-family="Arial, sans-serif" font-size="3.2" text-anchor="middle" ')}</g>
  <g font-family="Arial, sans-serif" fill="#243630"><text x="15" y="183" font-size="2.2" fill="#6d7872">PROJEKTI</text><text x="15" y="190" font-size="4.2">${escapeXml(project.name)}</text><text x="15" y="196" font-size="2.5">Tulosta 100 % koossa. Älä sovita sivulle.</text><text x="210" y="183" font-size="2.2" fill="#6d7872">MITTAKAAVA / ARKKI</text><text x="210" y="190" font-size="4">1:${scale}</text><text x="210" y="196" font-size="2.5">A4 · 297 × 210 mm</text><text x="255" y="183" font-size="2.2" fill="#6d7872">PÄIVÄYS</text><text x="255" y="190" font-size="3">${escapeXml(project.updatedAt.slice(0, 10))}</text><text x="255" y="196" font-size="2.5">${viewLabels[view]}</text></g>
  </svg>`;
  return { svg, fits, orphanCount };
}
