import { appearanceSchema, assetSchema, customMaterialSchema } from './materials';
import { cutSettingsSchema } from './cutSettings';
import { z } from 'zod';
import { resolveAnchor } from './guides';
import { polygonError } from './polygon';
import {
  frameSchema,
  profileSchema,
  profileBounds,
  type Profile,
  type SketchFrame,
} from './sketch';

const length = z.number().finite().min(0.1).max(100_000);
const coordinate = z.number().finite().min(-100_000).max(100_000);
const id = z.string().min(1).max(100);
export const pointSchema = z.tuple([coordinate, coordinate, coordinate]);
const rectangleFeature = z.object({
  type: z.literal('rectangle-extrusion'),
  width: length,
  depth: length,
  height: z.number().finite().min(0).max(100_000),
});
const polygonFeature = z
  .object({
    type: z.literal('polygon-extrusion'),
    width: length,
    depth: length,
    height: z.number().finite().min(0).max(100_000),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .min(3)
      .max(300),
  })
  .superRefine((feature, ctx) => {
    const error = polygonError(feature.points);
    if (error) ctx.addIssue({ code: 'custom', message: error });
    for (let axis = 0; axis < 2; axis++) {
      const values = feature.points.map((p) => p[axis]);
      if (
        Math.abs(Math.min(...values)) > 1e-5 ||
        Math.abs(Math.max(...values) - [feature.width, feature.depth][axis]) > 1e-5
      )
        ctx.addIssue({ code: 'custom', message: 'Monikulmion rajat eivät vastaa verteksiä.' });
    }
  });
const extent = z.number().finite().min(0).max(100_000);
const planarFeature = z
  .object({
    type: z.literal('planar-polygon'),
    width: extent,
    depth: extent,
    height: extent,
    points: z.array(pointSchema).min(3).max(300),
  })
  .superRefine((feature, ctx) => {
    try {
      validatePlanarPolygon(feature.points);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
    }
    const sizes = [feature.width, feature.depth, feature.height];
    for (let i = 0; i < 3; i++) {
      const values = feature.points.map((p) => p[i]);
      if (Math.abs(Math.min(...values)) > 1e-5 || Math.abs(Math.max(...values) - sizes[i]) > 1e-5)
        ctx.addIssue({ code: 'custom', message: 'Tasomuodon rajat eivät vastaa verteksiä.' });
    }
  });
const brepFeature = z.object({
  type: z.literal('brep'),
  width: extent,
  depth: extent,
  height: extent,
  data: z.string().min(1).max(8_000_000),
  solid: z.boolean(),
  topologyId: id,
});
const profileFeature = z
  .object({
    type: z.literal('profile-extrusion'),
    width: extent,
    depth: extent,
    height: extent,
    profile: profileSchema,
    frame: frameSchema,
    distance: z.number().finite().min(-100_000).max(100_000),
  })
  .superRefine((f, ctx) => {
    const { min, max } = profileBounds(f.profile, f.frame, f.distance),
      sizes = [f.width, f.depth, f.height];
    if (min.some((n) => Math.abs(n) > 1e-5) || max.some((n, i) => Math.abs(n - sizes[i]) > 1e-5))
      ctx.addIssue({ code: 'custom', message: 'Muodon mitat eivät vastaa piirtotasoa.' });
  });
const primitiveFeature = z.discriminatedUnion('type', [
  rectangleFeature,
  polygonFeature,
  planarFeature,
  brepFeature,
  profileFeature,
]);
const unionFeature = z
  .object({
    type: z.literal('union'),
    width: length,
    depth: length,
    height: length,
    operands: z
      .array(z.object({ feature: primitiveFeature, origin: pointSchema }))
      .min(2)
      .max(1000),
  })
  .superRefine((feature, ctx) => {
    const sizes = [feature.width, feature.depth, feature.height];
    for (let i = 0; i < 3; i++) {
      const min = Math.min(...feature.operands.map((o) => o.origin[i]));
      const max = Math.max(
        ...feature.operands.map(
          (o) => o.origin[i] + [o.feature.width, o.feature.depth, o.feature.height][i],
        ),
      );
      if (Math.abs(min) > 0.00001 || Math.abs(max - sizes[i]) > 0.00001)
        ctx.addIssue({
          code: 'custom',
          message: 'Yhdistetyn kappaleen rajat eivät vastaa geometriaa.',
        });
    }
    if (feature.operands.some((o) => !featureIsSolid(o.feature)))
      ctx.addIssue({ code: 'custom', message: 'Yhdistä vain tilavuuskappaleita.' });
  });
const featureSchema = z.discriminatedUnion('type', [
  rectangleFeature,
  polygonFeature,
  planarFeature,
  brepFeature,
  profileFeature,
  unionFeature,
]);
export const bodySchema = z.object({
  id,
  name: z.string().min(1).max(120),
  kind: z.literal('cad'),
  feature: featureSchema,
  edgeTreatment: z
    .object({
      id,
      source: featureSchema,
      offset: pointSchema,
      rotation: z.tuple([
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
      ]),
      indices: z.array(z.number().int().min(0)).min(1).max(10000),
      operation: z.enum(['fillet', 'chamfer']),
      size: length,
    })
    .optional(),
  origin: pointSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  material: z.enum(['matte', 'paint', 'wood', 'metal', 'glass']).optional(),
  appearance: appearanceSchema.optional(),
  textureFrame: z
    .object({
      offset: pointSchema,
      rotation: z.tuple([
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
      ]),
    })
    .optional(),
  purpose: z.enum(['model', 'construction', 'drawing', 'component']).default('model'),
  component: z
    .object({
      id,
      offset: pointSchema,
      rotation: z.tuple([
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
      ]),
    })
    .optional(),
  localMaterial: z.boolean().optional(),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  groupId: id.optional(),
  vertexRefs: z.record(z.string().max(512), pointSchema).optional(),
  linearEdges: z.array(z.tuple([pointSchema, pointSchema])).optional(),
});
const vertexAnchorSchema = z.object({
  bodyId: id,
  key: z.string().min(1).max(512),
  local: pointSchema,
});
export const edgeAnchorSchema = z.object({
  edge: z.object({ from: vertexAnchorSchema, to: vertexAnchorSchema, t: z.number().min(0).max(1) }),
});
export const anchorSchema = z.union([
  vertexAnchorSchema,
  edgeAnchorSchema,
  z.object({ point: pointSchema }),
]);
export const guideSchema = z.object({
  id,
  anchor: anchorSchema,
  plane: z.enum(['XY', 'XZ', 'YZ']),
  angle: z.number().finite().min(-360).max(360),
  length,
  mode: z.enum(['guide', 'free']),
  endAnchor: anchorSchema.optional(),
  direction: pointSchema
    .refine((v) => Math.hypot(...v) > 1e-9, 'Suunnan tulee olla nollasta poikkeava.')
    .optional(),
  offset: pointSchema.optional(),
  xray: z.boolean().optional(),
});
const extentDimensionSchema = z.object({
  id,
  bodyId: id,
  axis: z.enum(['x', 'y', 'z']),
  // Semantic references survive retessellation and edits of this feature.
  from: z.literal('min'),
  to: z.literal('max'),
});
export const pointDimensionSchema = z.object({
  id,
  kind: z.literal('points'),
  start: anchorSchema,
  end: anchorSchema,
  fallback: z.tuple([pointSchema, pointSchema]),
  axis: z.enum(['distance', 'x', 'y', 'z']),
  offset: pointSchema,
  normal: pointSchema,
});
export const dimensionSchema = z.union([extentDimensionSchema, pointDimensionSchema]);
export type PointDimension = z.infer<typeof pointDimensionSchema>;
export const isPointDimension = (d: Dimension): d is PointDimension =>
  'kind' in d && d.kind === 'points';
export const groupSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  hidden: z.boolean().default(false),
  locked: z.boolean().optional(),
  parentId: id.optional(),
  kind: z.enum(['folder', 'assembly']).optional(),
});
export type BodyGroup = z.infer<typeof groupSchema>;
export const projectSchema = z
  .object({
    format: z.literal('nivo'),
    version: z.literal(6),
    id,
    name: z.string().min(1).max(120),
    units: z.literal('mm'),
    assets: z.record(z.string().max(100), assetSchema).optional(),
    materials: z.array(customMaterialSchema).max(200).optional(),
    bodies: z.array(bodySchema).max(1000),
    groups: z.array(groupSchema).max(1000).default([]),
    dimensions: z.array(dimensionSchema).max(3000),
    guides: z.array(guideSchema).max(1000),
    settings: z
      .object({
        guideXray: z.boolean(),
        moveMode: z.enum(['axis', 'free']).optional(),
        gridStep: z.number().min(0.1).max(10000).optional(),
        cutting: cutSettingsSchema.optional(),
        axisStyle: z.enum(['subtle', 'strong']).default('subtle'),
        axisLabels: z.boolean().default(false),
        dimensionDisplay: z.enum(['all', 'selected', 'hidden']).default('all'),
        render: z
          .object({
            environment: z.enum(['studio', 'warm', 'dark']),
            exposure: z.number().min(0.3).max(2.5),
            shadows: z.boolean(),
            lightRotation: z.number().finite().min(0).max(360).optional(),
            lightPower: z.number().finite().min(0).max(4).optional(),
            environmentPower: z.number().finite().min(0).max(4).optional(),
            ground: z.boolean().optional(),
          })
          .optional(),
      })
      .default({
        guideXray: false,
        axisStyle: 'subtle',
        axisLabels: false,
        dimensionDisplay: 'all',
      }),
    updatedAt: z.string().datetime(),
  })
  .superRefine((p, ctx) => {
    for (const list of [p.bodies, p.dimensions, p.guides, p.groups]) {
      if (new Set(list.map((item) => item.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Tunnisteet eivät saa toistua.' });
    }
    if (p.bodies.some((body) => body.groupId && !p.groups.some((g) => g.id === body.groupId)))
      ctx.addIssue({ code: 'custom', message: 'Kappale viittaa puuttuvaan ryhmään.' });
    const assetSize = Object.values(p.assets ?? {}).reduce((sum, a) => sum + a.dataUrl.length, 0);
    if (assetSize > 32_000_000)
      ctx.addIssue({
        code: 'custom',
        message: 'Projektin kuvien yhteiskoko saa olla enintään 32 Mt.',
      });
    for (const appearance of [
      ...p.bodies.map((b) => b.appearance),
      ...(p.materials ?? []).map((m) => m.appearance),
    ])
      if (
        [appearance?.assetId, ...Object.values(appearance?.maps ?? {})].some(
          (id) => id && !p.assets?.[id],
        )
      )
        ctx.addIssue({ code: 'custom', message: 'Tekstuurin kuva puuttuu projektista.' });
    const groups = new Map(p.groups.map((g) => [g.id, g]));
    for (const group of p.groups) {
      const visited = new Set([group.id]);
      let parent = group.parentId;
      while (parent) {
        if (!groups.has(parent) || visited.has(parent)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Ryhmähierarkiassa on puuttuva tai kiertävä viite.',
          });
          break;
        }
        visited.add(parent);
        parent = groups.get(parent)!.parentId;
      }
    }
  });
export type Body = z.infer<typeof bodySchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Guide = z.infer<typeof guideSchema>;
export type VertexAnchor = z.infer<typeof vertexAnchorSchema>;
export type EdgeAnchor = z.infer<typeof edgeAnchorSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type WorkPlane = Guide['plane'];
export type Vec3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
export type FaceRef =
  'x:min' | 'x:max' | 'y:min' | 'y:max' | 'z:min' | 'z:max' | `surface:${number}`;
export type View = 'iso' | 'front' | 'right' | 'top';
export const axisIndex = { x: 0, y: 1, z: 2 } as const;
export const uid = () => crypto.randomUUID();
export const freshProject = (): Project => ({
  format: 'nivo',
  version: 6,
  id: uid(),
  name: 'Nimetön projekti',
  units: 'mm',
  bodies: [],
  groups: [],
  dimensions: [],
  guides: [],
  settings: { guideXray: false, axisStyle: 'subtle', axisLabels: false, dimensionDisplay: 'all' },
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
  if (isPointDimension(dimension)) {
    const a = resolveAnchor(project.bodies, dimension.start),
      b = resolveAnchor(project.bodies, dimension.end);
    if (!a || !b) return null;
    return dimension.axis === 'distance'
      ? Math.hypot(...a.map((v, i) => b[i] - v))
      : Math.abs(b[axisIndex[dimension.axis]] - a[axisIndex[dimension.axis]]);
  }
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
  if (text.length > 64_000_000)
    throw new Error('Projektitiedosto on liian suuri (enintään 64 Mt).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Tiedosto ei ole luettava Nivo-projekti.');
  }
  // V1 files are migrated in memory; the original file is never rewritten implicitly.
  if (value && typeof value === 'object' && 'version' in value && value.version === 1)
    value = { ...value, version: 2, guides: [] };
  if (value && typeof value === 'object' && 'version' in value && value.version === 2)
    value = { ...value, version: 3, settings: { guideXray: false } };
  if (value && typeof value === 'object' && 'version' in value && value.version === 3)
    value = { ...value, version: 4 };
  if (value && typeof value === 'object' && 'version' in value && value.version === 4)
    value = { ...value, version: 5, groups: [] };
  if (value && typeof value === 'object' && 'version' in value && value.version === 5)
    value = { ...value, version: 6 };
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error('Projektin versio tai sisältö ei ole tuettu. Nykyinen työ säilyi.');
  return result.data;
}
export function mergeBodies(bodies: Body[]): Body {
  if (bodies.length < 2 || bodies.some((b) => !featureIsSolid(b.feature)))
    throw new Error('Valitse vähintään kaksi kappaletta, joilla on paksuus.');
  const box = bounds(bodies);
  const operands = bodies.flatMap((body) => {
    const parts =
      body.feature.type === 'union'
        ? body.feature.operands
        : [{ feature: body.feature, origin: [0, 0, 0] as Vec3 }];
    return parts.map((part) => ({
      feature: part.feature,
      origin: part.origin.map((v, i) => v + body.origin[i] - box.min[i]) as Vec3,
    }));
  });
  return bodySchema.parse({
    id: uid(),
    name: 'Yhdistetty osa',
    kind: 'cad',
    origin: box.min,
    color: bodies[0].color,
    feature: {
      type: 'union',
      width: box.max[0] - box.min[0],
      depth: box.max[1] - box.min[1],
      height: box.max[2] - box.min[2],
      operands,
    },
  });
}
export function makePolygonBody(points: Vec3[], name = 'Kynämuoto'): Body {
  if (points.some((p) => Math.abs(p[2] - points[0][2]) > 1e-6)) {
    validatePlanarPolygon(points);
    const origin = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3;
    const sizes = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) - origin[i]);
    return bodySchema.parse({
      id: uid(),
      name,
      kind: 'cad',
      origin,
      color: '#c3a57e',
      feature: {
        type: 'planar-polygon',
        width: sizes[0],
        depth: sizes[1],
        height: sizes[2],
        points: points.map((p) => p.map((n, i) => n - origin[i])),
      },
    });
  }
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  const local = points.map((p) => [p[0] - minX, p[1] - minY] as [number, number]);
  const error = polygonError(local);
  if (error) throw new Error(error);
  return bodySchema.parse({
    id: uid(),
    name,
    kind: 'cad',
    color: '#c3a57e',
    origin: [minX, minY, points[0][2]],
    feature: {
      type: 'polygon-extrusion',
      width: Math.max(...local.map((p) => p[0])),
      depth: Math.max(...local.map((p) => p[1])),
      height: 0,
      points: local,
    },
  });
}
export function featureIsSolid(feature: Body['feature']): boolean {
  return feature.type === 'profile-extrusion'
    ? Math.abs(feature.distance) > 1e-8
    : feature.type === 'brep'
      ? feature.solid
      : feature.type === 'planar-polygon'
        ? false
        : feature.height > 0;
}
export function makeProfileBody(
  profile: Profile,
  frame: SketchFrame,
  distance = 0,
  name = 'Muoto',
  purpose: Body['purpose'] = 'model',
): Body {
  const { min, max } = profileBounds(profile, frame, distance);
  return bodySchema.parse({
    id: uid(),
    name,
    kind: 'cad',
    origin: min,
    color: '#c3a57e',
    purpose,
    feature: {
      type: 'profile-extrusion',
      width: max[0] - min[0],
      depth: max[1] - min[1],
      height: max[2] - min[2],
      profile,
      frame: { ...frame, origin: frame.origin.map((n, i) => n - min[i]) },
      distance,
    },
  });
}
export function validatePlanarPolygon(points: Vec3[]) {
  if (points.length < 3) throw new Error('Muoto tarvitsee vähintään kolme verteksiä.');
  const start = points[0],
    a = points[1].map((n, i) => n - start[i]);
  let normal: number[] = [0, 0, 0];
  for (const p of points.slice(2)) {
    const b = p.map((n, i) => n - start[i]);
    normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (Math.hypot(...normal) > 1e-8) break;
  }
  const size = Math.hypot(...normal);
  if (size < 1e-8) throw new Error('Verteksit eivät muodosta pinta-alaa.');
  normal = normal.map((n) => n / size);
  if (points.some((p) => Math.abs(p.reduce((s, n, i) => s + (n - start[i]) * normal[i], 0)) > 1e-5))
    throw new Error(
      'Suljettavan muodon pisteiden tulee olla samalla tasolla. Voit jatkaa tai poistaa viimeisen pisteen.',
    );
  const omit = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const axes = [0, 1, 2].filter((i) => i !== omit);
  const error = polygonError(points.map((p) => [p[axes[0]], p[axes[1]]]));
  if (error) throw new Error(error);
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
