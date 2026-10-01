import { bounds, corners, dimensionValue, type Project, type Vec3 } from '../model/project';
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
export function recommendedScale(project: Project, view: DrawingView): number {
  const { min, max } = bounds(project.bodies.filter((b) => b.purpose !== 'construction'));
  const a = projectPoint(min, view),
    b = projectPoint(max, view);
  return (
    [1, 2, 5, 10, 20, 50, 100, 500, 1000].find(
      (s) => Math.abs(b[0] - a[0]) / s <= 235 && Math.abs(b[1] - a[1]) / s <= 125,
    ) ?? 1000
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
  const tx = 148.5 - (bx + bw / 2) / scale,
    ty = 93 - (by + bh / 2) / scale;
  const fits = bw / scale <= 235 && bh / scale <= 125;
  const map = (p: [number, number]): [number, number] => [tx + p[0] / scale, ty + p[1] / scale];
  const lines: string[] = [];
  let orphanCount = 0,
    horizontalCount = 0,
    verticalCount = 0;
  for (const dimension of project.dimensions) {
    if (project.bodies.find((b) => b.id === dimension.bodyId)?.purpose === 'construction') continue;
    const value = dimensionValue(project, dimension);
    if (value === null) {
      orphanCount++;
      continue;
    }
    const horizontal = dimension.axis === (view === 'right' ? 'y' : 'x');
    const vertical = dimension.axis === (view === 'top' ? 'y' : 'z');
    if ((!horizontal && !vertical) || value === 0) continue;
    const body = project.bodies.find((b) => b.id === dimension.bodyId)!;
    const pts = corners(body).map((p) => map(projectPoint(p, view)));
    const x1 = Math.min(...pts.map((p) => p[0])),
      x2 = Math.max(...pts.map((p) => p[0]));
    const y1 = Math.min(...pts.map((p) => p[1])),
      y2 = Math.max(...pts.map((p) => p[1]));
    const label = escapeXml(formatLength(value));
    if (horizontal) {
      const y = ty + (by + bh) / scale + 9 + (horizontalCount++ % 3) * 7;
      lines.push(
        `<g data-dimension="${escapeXml(dimension.id)}" data-mm="${n(value)}"><path d="M${n(x1)} ${n(y2 + 1)}V${n(y + 2)} M${n(x2)} ${n(y2 + 1)}V${n(y + 2)} M${n(x1)} ${n(y)}H${n(x2)} M${n(x1 - 1)} ${n(y + 1.5)}l2 -3 M${n(x2 - 1)} ${n(y + 1.5)}l2 -3"/><text x="${n((x1 + x2) / 2)}" y="${n(y - 1.5)}">${label}</text></g>`,
      );
    } else {
      const x = tx + bx / scale - 9 - (verticalCount++ % 3) * 7;
      lines.push(
        `<g data-dimension="${escapeXml(dimension.id)}" data-mm="${n(value)}"><path d="M${n(x1 - 1)} ${n(y1)}H${n(x - 2)} M${n(x1 - 1)} ${n(y2)}H${n(x - 2)} M${n(x)} ${n(y1)}V${n(y2)} M${n(x - 1.5)} ${n(y1 + 1)}l3 -2 M${n(x - 1.5)} ${n(y2 + 1)}l3 -2"/><text transform="translate(${n(x - 1.5)} ${n((y1 + y2) / 2)}) rotate(-90)">${label}</text></g>`,
      );
    }
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
