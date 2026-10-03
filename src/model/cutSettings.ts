import { z } from 'zod';

const size = z.number().finite().min(0.1).max(100_000);
export const cutOverrideSchema = z.object({
  included: z.boolean().optional(),
  grain: z.enum(['free', 'length', 'width']).optional(),
  stock: z.string().trim().min(1).max(80).optional(),
  blank: z
    .object({
      dimensions: z.tuple([size, size, size]),
      geometryKey: z.string().max(200),
    })
    .optional(),
});
export const cutSettingsSchema = z.object({
  length: size,
  width: size,
  kerf: z.number().finite().min(0).max(20),
  margin: z.number().finite().min(0).max(1000),
  parts: z.record(z.string().max(100), cutOverrideSchema).optional(),
});
export type CutSettings = z.infer<typeof cutSettingsSchema>;
export type CutOverride = z.infer<typeof cutOverrideSchema>;
export const cutDefaults: CutSettings = { length: 2800, width: 2070, kerf: 3.2, margin: 10 };
