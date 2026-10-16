import { z } from 'zod';
import { formatLength } from './units';

export const annotationStyle = {
  hidden: z.boolean().optional(),
  label: z.string().trim().max(160).optional(),
};

export const dimensionTextStyle = {
  /** Degrees on the screen/paper, independent of the camera and measured axis. */
  labelRotation: z.number().finite().min(-360).max(360).optional(),
};
export type AnnotationPatch = z.infer<
  z.ZodObject<typeof annotationStyle & typeof dimensionTextStyle>
>;
export const dimensionLineStyleSchema = z.enum(['drafting', 'solid']);
export type DimensionLineStyle = z.infer<typeof dimensionLineStyleSchema>;

/** An annotation never overrides the actual measurement or drives geometry. */
export function annotationText(annotation: { label?: string }, value: number, fallback: string) {
  return annotation.label?.trim()
    ? annotation.label.replaceAll('{mitta}', formatLength(value))
    : fallback;
}
