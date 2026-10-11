import { z } from 'zod';

const coordinate = z.number().finite().min(-200000).max(200000);
/** Wires lie on a common reference plane, in the part's local coordinates. */
export const surfaceLevelsSchema = z.object({
  normal: z
    .tuple([z.number(), z.number(), z.number()])
    .refine((v) => v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 1e-6),
  boundaries: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        wire: z.string().min(1).max(2000000),
        height: coordinate,
      }),
    )
    .min(2)
    .max(12),
  openCenter: z.boolean(),
  baseDepth: z.number().finite().min(0).max(100000),
});
export type SurfaceLevels = z.infer<typeof surfaceLevelsSchema>;
export interface SurfaceLevelOptions {
  heights: number[];
  openCenter: boolean;
  /** Distance from the reference plane down to a flat base; zero makes a skin. */
  baseDepth: number;
  name: string;
}
