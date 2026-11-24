import { z } from 'zod';
import { highlightStyle } from './highlightStyle';
import { formatLength } from './units';

const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .optional();
export const annotationStyle = {
  lineColor: color,
  labelColor: color,
  labelShape: z.enum(['rounded', 'square', 'pill']).optional(),
  lineStyle: highlightStyle.lineStyle,
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

export function labelInk(background: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(background.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#ffffff';
}

export function labelRadius(shape: AnnotationPatch['labelShape'], height: number) {
  return shape === 'square' ? 0 : shape === 'pill' ? height / 2 : 4;
}

/** An annotation never overrides the actual measurement or drives geometry. */
export function annotationText(annotation: { label?: string }, value: number, fallback: string) {
  return annotation.label?.trim()
    ? annotation.label.replaceAll('{mitta}', formatLength(value))
    : fallback;
}
