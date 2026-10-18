import { z } from 'zod';
export const surfaceLayerSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['dust', 'scratches', 'fingerprints', 'water', 'paint']),
  enabled: z.boolean(),
  /** Paint uses amount as wear: 0 = intact paint, 1 = exposed substrate. */
  amount: z.number().min(0).max(1),
  width: z.number().min(1).max(100000),
  height: z.number().min(1).max(100000),
  rotation: z.number().finite().min(-360000).max(360000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  seed: z.number().int().min(0).max(999999),
  /** Paint-only controls; legacy overlays need neither field. */
  chipSize: z.number().min(0.5).max(10000).optional(),
  roughness: z.number().min(0.04).max(1).optional(),
  /** Absent = repeating surface finish; present = one mark in the face's millimetre UVs. */
  center: z.tuple([z.number().finite(), z.number().finite()]).optional(),
});
export type SurfaceLayer = z.infer<typeof surfaceLayerSchema>;
