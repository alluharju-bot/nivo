import { z } from 'zod';

const length = z.number().finite().min(0.1).max(100_000);
const coordinate = z.number().finite().min(-100_000).max(100_000);
const id = z.string().min(1).max(100);
export const bodySchema = z.object({
  id,
  name: z.string().min(1).max(120),
  kind: z.literal('cad'),
  feature: z.object({
    type: z.literal('rectangle-extrusion'),
    width: length,
    depth: length,
    height: z.number().finite().min(0).max(100_000),
  }),
  origin: z.tuple([coordinate, coordinate, coordinate]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export const dimensionSchema = z.object({
  id,
  bodyId: id,
  axis: z.enum(['x', 'y', 'z']),
  // Semantic references survive retessellation and edits of this feature.
  from: z.literal('min'),
  to: z.literal('max'),
});
export const projectSchema = z
  .object({
    format: z.literal('nivo'),
    version: z.literal(1),
    id,
    name: z.string().min(1).max(120),
    units: z.literal('mm'),
    bodies: z.array(bodySchema).max(1000),
    dimensions: z.array(dimensionSchema).max(3000),
    updatedAt: z.string().datetime(),
  })
  .superRefine((p, ctx) => {
    for (const list of [p.bodies, p.dimensions]) {
      if (new Set(list.map((item) => item.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Tunnisteet eivät saa toistua.' });
    }
  });
export type Body = z.infer<typeof bodySchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Vec3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
export type FaceRef = 'x:min' | 'x:max' | 'y:min' | 'y:max' | 'z:min' | 'z:max';
export type View = 'iso' | 'front' | 'right' | 'top';
export const axisIndex = { x: 0, y: 1, z: 2 } as const;
export const uid = () => crypto.randomUUID();
export const freshProject = (): Project => ({
  format: 'nivo',
  version: 1,
  id: uid(),
  name: 'Nimetön projekti',
  units: 'mm',
  bodies: [],
  dimensions: [],
  updatedAt: new Date().toISOString(),
});
export function makeBody(
  width = 600,
  depth = 400,
  height = 0,
  origin: Vec3 = [0, 0, 0],
  name = 'Levy',
): Body {
  return bodySchema.parse({
    id: uid(),
    name,
    kind: 'cad',
    feature: { type: 'rectangle-extrusion', width, depth, height },
    origin,
    color: '#c3a57e',
  });
}
export function dimensionValue(project: Project, dimension: Dimension): number | null {
  const body = project.bodies.find((b) => b.id === dimension.bodyId);
  if (!body) return null; // Never silently attach a missing reference to another body.
  return [body.feature.width, body.feature.depth, body.feature.height][axisIndex[dimension.axis]];
}
export function corners(body: Body): Vec3[] {
  const [x, y, z] = body.origin;
  const { width: w, depth: d, height: h } = body.feature;
  return [0, w].flatMap((dx) =>
    [0, d].flatMap((dy) => [0, h].map((dz) => [x + dx, y + dy, z + dz] as Vec3)),
  );
}
export function bounds(bodies: Body[]): { min: Vec3; max: Vec3 } {
  if (!bodies.length) return { min: [0, 0, 0], max: [600, 400, 400] };
  const points = bodies.flatMap(corners);
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
  };
}
export function parseProject(text: string): Project {
  if (text.length > 10_000_000)
    throw new Error('Projektitiedosto on liian suuri (enintään 10 Mt).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Tiedosto ei ole luettava Nivo-projekti.');
  }
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error('Projektin versio tai sisältö ei ole tuettu. Nykyinen työ säilyi.');
  return result.data;
}
export function cabinetProject(): Project {
  return {
    ...freshProject(),
    name: 'Ensimmäinen kaappi',
    bodies: [
      makeBody(18, 560, 800, [0, 0, 0], 'Vasen sivu'),
      makeBody(18, 560, 800, [582, 0, 0], 'Oikea sivu'),
      makeBody(564, 560, 18, [18, 0, 0], 'Pohja'),
      makeBody(564, 560, 18, [18, 0, 782], 'Kansi'),
      makeBody(564, 530, 18, [18, 15, 390], 'Hylly'),
      makeBody(564, 18, 764, [18, 542, 18], 'Tausta'),
    ],
  };
}
