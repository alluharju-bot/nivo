import { escapeXml as xml } from './svg';
import { formatLength as mm } from '../model/units';
import type { CutPart, CutPlan, CutSheet } from '../model/cutting';
import type { CutSettings } from '../model/cutSettings';
import { safeFilename } from '../storage/projects';

const n = (v: number) => Number(v.toFixed(5));
const short = (s: string, length: number) => (s.length > length ? `${s.slice(0, length - 1)}…` : s);
const text = (x: number, y: number, value: string, size = 3.2, extra = '') =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}" ${extra}>${xml(value)}</text>`;
const page = (content: string, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210" role="img" aria-label="${xml(label)}"><rect width="297" height="210" fill="white"/><g font-family="Arial, sans-serif" fill="#243630">${content}</g></svg>`;

export function cutSheetSVG(
  sheet: CutSheet,
  settings: CutSettings,
  title: string,
  incomplete = 0,
  selected?: string,
) {
  const scale = Math.min(260 / settings.length, 133 / settings.width);
  const w = settings.length * scale,
    h = settings.width * scale;
  const x = (297 - w) / 2,
    y = 40 + (133 - h) / 2;
  const rect = (r: { x: number; y: number; width: number; height: number }, attrs: string) =>
    `<rect x="${n(x + r.x * scale)}" y="${n(y + r.y * scale)}" width="${n(r.width * scale)}" height="${n(r.height * scale)}" ${attrs}/>`;
  const used =
    sheet.placements.reduce((s, p) => s + p.width * p.height, 0) /
    (settings.length * settings.width);
  const largest = [...sheet.remainders].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  let content = text(12, 14, 'NIVO / LEIKKAUSLISTA', 3) + text(12, 23, short(title, 65), 4.4);
  content += text(
    285,
    14,
    `Levy ${sheet.number} · ${mm(sheet.thickness)} mm`,
    4,
    'text-anchor="end"',
  );
  content += text(285, 23, short(sheet.material, 48), 3.2, 'text-anchor="end"');
  if (incomplete)
    content += text(
      12,
      32,
      `KESKENERÄINEN — ${incomplete} osaa ilman sijoitusta. Katso osalista.`,
      3,
      'fill="#a04325"',
    );
  content += rect(
    { x: 0, y: 0, width: settings.length, height: settings.width },
    'fill="#f0f1ed" stroke="#8d998e" stroke-width="0.25"',
  );
  content += rect(
    {
      x: settings.margin,
      y: settings.margin,
      width: settings.length - 2 * settings.margin,
      height: settings.width - 2 * settings.margin,
    },
    'fill="white" stroke="#9da79a" stroke-width="0.2" stroke-dasharray="1 1"',
  );
  for (const r of sheet.remainders)
    content += rect(r, 'fill="#f0f1ed" stroke="#cad0c6" stroke-width="0.15"');
  for (const p of sheet.placements) {
    const cx = x + (p.x + p.width / 2) * scale,
      cy = y + (p.y + p.height / 2) * scale;
    const label = `#${p.part.number} ${p.part.name} · ${p.part.dimensions!.map(mm).join(' × ')} mm`;
    content += `<g data-cut-part="${xml(p.part.id)}" role="button" tabindex="0" aria-label="${xml(label)}"><title>${xml(label)}</title>`;
    content += rect(
      p,
      `fill="${p.part.id === selected ? '#b8d8a6' : '#e3eadc'}" stroke="#536b4e" stroke-width="${p.part.id === selected ? '0.6' : '0.25'}"`,
    );
    content += text(
      cx,
      cy + 1.2,
      String(p.part.number),
      3.6,
      'text-anchor="middle" font-weight="bold"',
    );
    if (p.width * scale > 26 && p.height * scale > 15)
      content += text(cx, cy + 6, `${mm(p.width)} × ${mm(p.height)}`, 2.5, 'text-anchor="middle"');
    if (p.part.grain !== 'free' && p.width * scale > 18 && p.height * scale > 22)
      content += `<path d="M${n(cx - 5)} ${n(cy - 6)}h10l-2 -1 M${n(cx + 5)} ${n(cy - 6)}l-2 1" fill="none" stroke="#607556" stroke-width="0.3"/>`;
    content += '</g>';
  }
  content += text(
    148.5,
    y - 3,
    `${mm(settings.length)} mm · levyn pituus / syysuunta`,
    3,
    'text-anchor="middle"',
  );
  content += `<text transform="translate(${n(x - 4)} ${n(y + h / 2)}) rotate(-90)" text-anchor="middle" font-size="3">${xml(mm(settings.width))} mm</text>`;
  content += text(
    12,
    185,
    `${sheet.placements.length} osaa · käyttöaste ${mm(used * 100)} % · sahausura ${mm(settings.kerf)} mm · reunavara ${mm(settings.margin)} mm`,
    3,
  );
  content += text(
    12,
    192,
    largest
      ? `Suurin jäännöspala: ${mm(largest.width)} × ${mm(largest.height)} mm. Harmaat alueet jäävät yli.`
      : 'Harmaat alueet jäävät yli.',
    3,
  );
  content += text(
    12,
    201,
    'Mitat millimetreinä. Numerot vastaavat osalistaa. Kuva ei ole mittakaavassa.',
    2.8,
  );
  return page(content, `Levy ${sheet.number}: ${sheet.material}, ${mm(sheet.thickness)} mm`);
}

export function cutListSVGs(parts: CutPart[], plan: CutPlan, settings: CutSettings, title: string) {
  const location = new Map(
    plan.sheets.flatMap((s) => s.placements.map((p) => [p.part.id, s.number] as const)),
  );
  const unplaced = new Map(plan.unplaced.map((p) => [p.part.id, p.reason]));
  const pages: string[] = [];
  for (let start = 0; start < parts.length; start += 14) {
    let content =
      text(12, 14, 'NIVO / NUMEROITU OSALISTA', 3) + text(12, 23, short(title, 80), 4.4);
    content += text(
      12,
      32,
      `${plan.sheets.length} levyä · ${mm(settings.length)} × ${mm(settings.width)} mm · sahausura ${mm(settings.kerf)} mm · reunavara ${mm(settings.margin)} mm`,
      3,
    );
    if (plan.unplaced.length)
      content += text(
        12,
        40,
        `${plan.unplaced.length} osaa ilman sijoitusta — ratkaise alla merkityt osat ennen leikkaamista.`,
        3,
        'fill="#a04325"',
      );
    content +=
      text(12, 49, 'Nro / osa / materiaali', 3) +
      text(166, 49, 'Aihio: pituus × leveys × paksuus', 3) +
      text(257, 49, 'Levy / syyt', 3);
    parts.slice(start, start + 14).forEach((p, index) => {
      const y = 57 + index * 9.5;
      const state = !p.included
        ? 'Ei mukana'
        : unplaced.has(p.id)
          ? 'Tarkista'
          : String(location.get(p.id) ?? '—');
      content += `<path d="M12 ${n(y - 4)}H285" stroke="#d6dcd2" stroke-width="0.2"/>`;
      content += text(12, y, `${p.number}. ${short(p.name, 65)}`, 3.2);
      content += text(
        12,
        y + 3.8,
        short(
          unplaced.get(p.id) ??
            [p.group, p.material, p.manual ? 'Käsin annettu aihio' : '']
              .filter(Boolean)
              .join(' · '),
          96,
        ),
        2.5,
      );
      content += text(
        166,
        y,
        p.dimensions ? p.dimensions.map(mm).join(' × ') : 'Aihion mitat puuttuvat',
        3.2,
      );
      content +=
        text(257, y, state, 3.2) +
        text(257, y + 3.8, { free: 'Vapaa', length: 'Pituus', width: 'Leveys' }[p.grain], 2.5);
    });
    content += text(
      12,
      196,
      'Syyt: osan valittu suunta on levyn pituuden suuntainen. Reunalistoja tai koneistuksia ei vähennetä mitoista.',
      2.7,
    );
    content += text(
      12,
      202,
      'Suorakulmaiset aihiot. Käsin annetut aihiot tarkistetaan mallista. Ei CNC-ohjelmaa.',
      2.7,
    );
    content += text(285, 202, `Osalista ${pages.length + 1}`, 2.7, 'text-anchor="end"');
    pages.push(page(content, `Numeroitu osalista ${pages.length + 1}`));
  }
  return pages;
}

export async function exportCutPDF(pages: string[], name: string) {
  if (!pages.length) return;
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i) pdf.addPage();
    const svg = new DOMParser().parseFromString(pages[i], 'image/svg+xml').documentElement;
    await pdf.svg(svg, { x: 0, y: 0, width: 297, height: 210 });
  }
  pdf.save(`${safeFilename(name)}-leikkauslista.pdf`);
}

export function cuttingCSV(parts: CutPart[], plan: CutPlan) {
  const location = new Map(
    plan.sheets.flatMap((s) => s.placements.map((p) => [p.part.id, s.number] as const)),
  );
  const cell = (value: string | number) =>
    `"${String(value)
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [
      [
        'Nro',
        'Osa',
        'Ryhmä',
        'Materiaali',
        'Määrä',
        'Aihion pituus (mm)',
        'Aihion leveys (mm)',
        'Paksuus (mm)',
        'Levy',
        'Syysuunta levyn pituuteen',
        'Tila',
      ],
      ...parts.map((p) => [
        p.number,
        p.name,
        p.group,
        p.material,
        1,
        ...(p.dimensions ?? ['', '', '']),
        location.get(p.id) ?? '',
        { free: 'Vapaa', length: 'Pituus', width: 'Leveys' }[p.grain],
        !p.included
          ? 'Ei mukana'
          : (plan.unplaced.find((u) => u.part.id === p.id)?.reason ??
            (p.manual ? 'Käsin annettu aihio' : 'Suorakulmainen osa')),
      ]),
    ]
      .map((row) => row.map(cell).join(';'))
      .join('\r\n')
  );
}
