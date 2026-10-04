import { z } from 'zod';
import { frameSchema, type SketchFrame } from './sketch';
import type { Body, Vec3 } from './project';
import { add, dot, scale, sub } from './geometry';

const coordinate = z.number().finite().min(-200000).max(200000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const anchor = z.object({
  bodyId: z.string().min(1).max(100),
  point,
  signature: z.string().max(100),
});
export const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  frame: frameSchema,
  flipped: z.boolean().default(false),
  dimensions: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        start: anchor,
        end: anchor,
        axis: z.enum(['horizontal', 'vertical', 'distance']),
        offset: z.number().finite().min(-100000).max(100000),
      }),
    )
    .max(500)
    .default([]),
});
export type Section = z.infer<typeof sectionSchema>;
export type SectionAnchor = Section['dimensions'][number]['start'];
/** A compact invalidation key, not a geometry identifier or a security hash. */
export function sectionBodySignature(body: Body): string {
  const value = JSON.stringify([body.feature, body.origin]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `${value.length}:${a >>> 0}:${b >>> 0}`;
}
/** Positive distance is on the removed (camera-facing) side. */
export function sectionDistance(section: Section, point: Vec3): number {
  return dot(sub(point, section.frame.origin), section.frame.normal) * (section.flipped ? -1 : 1);
}
export function sectionAxis(section: Section): number | undefined {
  const index = section.frame.normal.findIndex((n) => Math.abs(n) > 1 - 1e-8);
  return index < 0 ? undefined : index;
}
export function sectionPosition(section: Section): number {
  const axis = sectionAxis(section);
  return axis === undefined
    ? dot(section.frame.origin, section.frame.normal)
    : section.frame.origin[axis];
}
export function positionSection(section: Section, position: number): Section {
  return {
    ...section,
    frame: {
      ...section.frame,
      origin: add(
        section.frame.origin,
        scale(
          section.frame.normal,
          (position - sectionPosition(section)) *
            (sectionAxis(section) === undefined ? 1 : section.frame.normal[sectionAxis(section)!]),
        ),
      ),
    },
  };
}
export function sectionFrame(axis: 'x' | 'y' | 'z', origin: Vec3): SketchFrame {
  return {
    origin,
    normal: axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, -1, 0] : [0, 0, 1],
    u: axis === 'x' ? [0, 1, 0] : [1, 0, 0],
  };
}
