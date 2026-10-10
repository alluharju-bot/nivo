import { z } from 'zod';
import type { Vec3 } from './project';
import { axisVector, dot, scale } from './geometry';
import { frameV, sketchFrame } from './sketch';

export const openingPatternSchema = z.object({
  count: z.number().int().min(1).max(100),
  spacing: z.number().finite().min(-100000).max(100000),
  direction: z.enum(['u', 'v', 'x', 'y', 'z']),
  first: z.union([z.literal(0), z.literal(1)]).default(0),
  depth: z.number().finite().positive().max(100000).optional(),
  radial: z
    .object({
      pivot: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
      axis: z.enum(['x', 'y', 'z']),
      angle: z.number().finite().min(-360).max(360),
      fullCircle: z.boolean().optional(),
    })
    .optional(),
});
export type OpeningPattern = z.infer<typeof openingPatternSchema>;
export const singleOpening: OpeningPattern = { count: 1, spacing: 10, direction: 'u', first: 0 };
export function openingAngles(options: OpeningPattern): number[] {
  const parsed = openingPatternSchema.safeParse(options);
  if (!parsed.success || !parsed.data.radial)
    throw new Error('Tarkista ympyrätoiston määrä, akseli, kiertopiste ja kulma.');
  const { count, first, radial } = parsed.data;
  const angle = radial.fullCircle ? 360 / (count + first) : radial.angle;
  if (
    Math.abs(angle) < 1e-6 ||
    (!radial.fullCircle && Math.abs(angle) * (count - 1 + first) >= 360 - 1e-6)
  )
    throw new Error('Ympyrätoisto kiertäisi päällekkäin. Pienennä määrää tai kulmaväliä.');
  if (radial.pivot.some((n) => Math.abs(n) > 100000))
    throw new Error('Kiertopiste ylittää sallitun sijaintialueen.');
  return Array.from({ length: count }, (_, i) => angle * (i + first));
}
export function openingOffsets(options: OpeningPattern, normal: Vec3): Vec3[] {
  const parsed = openingPatternSchema.safeParse(options);
  if (!parsed.success) throw new Error('Anna aukkojen määräksi 1–100 ja sallitut mitat.');
  const { count, spacing, direction, first } = parsed.data;
  if (count === 1 && !first) return [[0, 0, 0]];
  if (Math.abs(spacing) < 1e-6) throw new Error('Aukkojen väli ei voi olla nolla.');
  const frame = sketchFrame([0, 0, 0], normal);
  const axis =
    direction === 'u' ? frame.u : direction === 'v' ? frameV(frame) : axisVector(direction);
  if (Math.abs(dot(normal, axis)) > 1e-6)
    throw new Error('Valitse aukon pinnan suuntainen toistosuunta.');
  if (Math.abs(spacing * (count - 1 + first)) > 100000)
    throw new Error('Aukkosarja ylittää sallitun sijaintialueen.');
  return Array.from({ length: count }, (_, i) => scale(axis, spacing * (i + first)));
}
