import { z } from 'zod';

export const highlightStyle = {
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  lineWidth: z.number().finite().min(1).max(4).optional(),
  fillOpacity: z.number().finite().min(0).max(0.5).optional(),
};
export type HighlightStyle = {
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  fillOpacity?: number;
};
export function highlightDash(style: HighlightStyle['lineStyle'], unit = 1) {
  return style === 'dotted'
    ? `${unit} ${4 * unit}`
    : style === 'dashed'
      ? `${8 * unit} ${4 * unit}`
      : undefined;
}
