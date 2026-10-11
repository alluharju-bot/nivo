import { z } from 'zod';

export const partTypeSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  unit: z.enum(['count', 'length', 'area']),
});
const size = z.number().finite().min(0).max(100_000);
const direction = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(
    (v) => Math.abs(Math.hypot(...v) - 1) < 1e-6,
    'Aihion akselin tulee olla yksikkövektori.',
  );
export const quantityBasisSchema = z.object({
  dimensions: z.tuple([size, size, size]),
  geometryKey: z.string().max(200),
  axes: z
    .tuple([direction, direction, direction])
    .refine(
      (axes) =>
        axes.every((a, i) =>
          axes.slice(i + 1).every((b) => Math.abs(a.reduce((s, v, j) => s + v * b[j], 0)) < 1e-6),
        ),
      'Aihion akselien tulee olla kohtisuorassa.',
    )
    .optional(),
  manual: z.boolean().optional(),
});
export type PartType = z.infer<typeof partTypeSchema>;
export type QuantityBasis = z.infer<typeof quantityBasisSchema>;
export const typeNameKey = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase('fi');
