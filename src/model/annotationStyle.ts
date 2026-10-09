import { z } from 'zod';
import { formatLength } from './units';

export const annotationStyle = {
  hidden: z.boolean().optional(),
  label: z.string().trim().max(160).optional(),
};

/** An annotation never overrides the actual measurement or drives geometry. */
export function annotationText(annotation: { label?: string }, value: number, fallback: string) {
  return annotation.label?.trim()
    ? annotation.label.replaceAll('{mitta}', formatLength(value))
    : fallback;
}
