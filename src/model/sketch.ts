import { z } from 'zod';
import type { Vec3 } from './project';
import { add, sub, scale, dot, unit } from './geometry';
import { polygonError } from './polygon';

const coordinate = z.number().finite().min(-200_000).max(200_000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const length = z.number().finite().min(0.1).max(100_000);
export const frameSchema = z
  .object({ origin: point, u: point, normal: point })
  .superRefine((f, ctx) => {
    if (
      Math.abs(Math.hypot(...f.u) - 1) > 1e-6 ||
      Math.abs(Math.hypot(...f.normal) - 1) > 1e-6 ||
      Math.abs(dot(f.u, f.normal)) > 1e-6
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Piirtotason akselien tulee olla kohtisuorat yksikkövektorit.',
      });
  });
export const profileSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rectangle'), width: length, depth: length }),
  z.object({ kind: z.literal('circle'), radius: length }),
  z.object({ kind: z.literal('ellipse'), radiusX: length, radiusY: length }),
  z
    .object({
      kind: z.literal('polygon'),
      points: z
        .array(z.tuple([coordinate, coordinate]))
        .min(3)
        .max(300),
    })
    .superRefine((p, ctx) => {
      const error = polygonError(p.points);
      if (error) ctx.addIssue({ code: 'custom', message: error });
    }),
]);
export type SketchFrame = z.infer<typeof frameSchema>;
export type Profile = z.infer<typeof profileSchema>;
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function sketchFrame(origin: Vec3, normal: Vec3 = [0, 0, 1]): SketchFrame {
  normal = unit(normal);
  const candidate: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return { origin, normal, u: unit(sub(candidate, scale(normal, dot(candidate, normal)))) };
}
export const frameV = (frame: SketchFrame) => cross(frame.normal, frame.u);
export const fromUV = (p: [number, number], frame: SketchFrame): Vec3 =>
  add(frame.origin, add(scale(frame.u, p[0]), scale(frameV(frame), p[1])));
export const toUV = (p: Vec3, frame: SketchFrame): [number, number] => [
  dot(sub(p, frame.origin), frame.u),
  dot(sub(p, frame.origin), frameV(frame)),
];
export const ontoFrame = (p: Vec3, frame: SketchFrame): Vec3 => fromUV(toUV(p, frame), frame);
export function profilePoints(profile: Profile, segments = 96): [number, number][] {
  if (profile.kind === 'polygon') return profile.points;
  if (profile.kind === 'rectangle')
    return [
      [0, 0],
      [profile.width, 0],
      [profile.width, profile.depth],
      [0, profile.depth],
    ];
  const rx = profile.kind === 'circle' ? profile.radius : profile.radiusX,
    ry = profile.kind === 'circle' ? profile.radius : profile.radiusY;
  return Array.from({ length: segments }, (_, i) => [
    rx * Math.cos((i / segments) * Math.PI * 2),
    ry * Math.sin((i / segments) * Math.PI * 2),
  ]);
}
export function profileBounds(
  profile: Profile,
  frame: SketchFrame,
  distance = 0,
): { min: Vec3; max: Vec3 } {
  let min: Vec3, max: Vec3;
  if (profile.kind === 'circle' || profile.kind === 'ellipse') {
    const v = frameV(frame),
      rx = profile.kind === 'circle' ? profile.radius : profile.radiusX,
      ry = profile.kind === 'circle' ? profile.radius : profile.radiusY;
    const extent = frame.u.map((n, i) => Math.hypot(n * rx, v[i] * ry)) as Vec3;
    min = sub(frame.origin, extent);
    max = add(frame.origin, extent);
  } else {
    const points = profilePoints(profile).map((p) => fromUV(p, frame));
    min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3;
    max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3;
  }
  const delta = scale(frame.normal, distance);
  return {
    min: min.map((n, i) => n + Math.min(0, delta[i])) as Vec3,
    max: max.map((n, i) => n + Math.max(0, delta[i])) as Vec3,
  };
}
