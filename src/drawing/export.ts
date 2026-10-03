import type { Sheet } from './svg';
import { safeFilename } from '../storage/projects';

export async function exportDrawingPDF(sheet: Sheet, name: string) {
  if (!sheet.fits || sheet.orphanCount) throw new Error('Korjaa arkin mitoitus ennen vientiä.');
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const svg = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml').documentElement;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await pdf.svg(svg, { x: 0, y: 0, width: 297, height: 210 });
  pdf.save(`${safeFilename(name)}.pdf`);
}
