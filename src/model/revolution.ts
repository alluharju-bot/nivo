import { z } from 'zod';
const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const revolutionSchema = z.object({
  profile: z.string().min(1).max(16_000_000),
  profileName: z.string().min(1).max(120),
  origin: point,
  axis: point.refine((v) => Math.abs(Math.hypot(...v) - 1) < 1e-6),
  angle: z
    .number()
    .finite()
    .min(-360)
    .max(360)
    .refine((v) => Math.abs(v) >= 0.01),
  solid: z.boolean(),
  curve: z
    .object({
      points: z.array(point).min(2).max(301),
      mode: z.enum(['smooth', 'bezier']),
      closed: z.boolean(),
    })
    .optional(),
});
export type Revolution = z.infer<typeof revolutionSchema>;
export type RevolutionOptions = Pick<Revolution, 'origin' | 'axis' | 'angle'> & { name: string };
