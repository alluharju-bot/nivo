export function parseLength(input: string, allowNegative = false, allowZero = false): number {
  if (allowZero && !input.trim()) return 0;
  const match = input
    .trim()
    .toLowerCase()
    .match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(mm|cm|m)?$/);
  if (!match) throw new Error('Anna mitta, esimerkiksi 600, 18 mm tai 2,4 m.');
  const value = Number(match[1].replace(',', '.')) * { mm: 1, cm: 10, m: 1000 }[match[2] || 'mm']!;
  if (!Number.isFinite(value) || Math.abs(value) > 100_000)
    throw new Error('Mitan on oltava enintään 100 000 mm.');
  if (!allowNegative && value < 0) throw new Error('Mitan on oltava positiivinen.');
  if (!allowZero && Math.abs(value) < 0.1) throw new Error('Pienin mitta on 0,1 mm.');
  return value;
}
export const formatLength = (value: number) =>
  new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(value);
