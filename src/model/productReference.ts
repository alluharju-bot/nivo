import { z } from 'zod';

/** A product reference is provenance, not a guarantee that edited geometry matches a product. */
export const productReferenceSchema = z.object({
  catalogKey: z.string().min(1).max(100),
  brand: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  article: z.string().max(100).optional(),
  variant: z.string().max(100).optional(),
  source: z
    .string()
    .max(2048)
    .url()
    .refine((url) => url.startsWith('https://')),
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  representation: z.enum(['installation-space', 'opening-profile', 'imported-model']),
});

export type ProductReference = z.infer<typeof productReferenceSchema>;
export const productRepresentation = {
  'installation-space': 'Asennustilavaraus',
  'opening-profile': 'Asennusaukon luonnos',
  'imported-model': 'Oma tuotu malli',
} as const;
