import { z } from 'zod';
export const surfaceLayerSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['dust', 'scratches', 'fingerprints', 'water']),
  enabled: z.boolean(),
  amount: z.number().min(0).max(1),
  width: z.number().min(1).max(100000),
  height: z.number().min(1).max(100000),
  rotation: z.number().finite().min(-360000).max(360000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  seed: z.number().int().min(0).max(999999),
  /** Absent = repeating surface finish; present = one mark in the face's millimetre UVs. */
  center: z.tuple([z.number().finite(), z.number().finite()]).optional(),
});
export type SurfaceLayer = z.infer<typeof surfaceLayerSchema>;
