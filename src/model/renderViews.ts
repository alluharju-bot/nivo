import { z } from 'zod';
const point = z.tuple([
  z.number().finite().min(-1e9).max(1e9),
  z.number().finite().min(-1e9).max(1e9),
  z.number().finite().min(-1e9).max(1e9),
]);
export const renderViewSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    position: point,
    target: point,
    focalLength: z.number().finite().min(12).max(200),
  })
  .refine(
    (v) => Math.hypot(...v.position.map((n, i) => n - v.target[i])) > 0.01,
    'Kameran on oltava erillään kohdepisteestä.',
  );
export type RenderView = z.infer<typeof renderViewSchema>;
