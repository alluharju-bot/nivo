import { z } from 'zod';

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const decalPathSchema = z.object({
  kind: z.enum(['pen', 'line', 'rectangle', 'ellipse', 'bezier']),
  points: z.array(point).min(1).max(1024),
  width: z.number().min(0.002).max(0.25),
  fill: z.boolean(),
  erase: z.boolean(),
});
export const decalSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().max(1000),
    font: z.enum(['sans', 'stencil', 'mono']),
    spacing: z.number().min(-0.05).max(0.5),
    align: z.enum(['left', 'center', 'right']),
  }),
  z.object({ type: z.literal('image'), assetId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('drawing'), paths: z.array(decalPathSchema).max(128) }),
]);
export type DecalSource = z.infer<typeof decalSourceSchema>;
export type DecalPath = z.infer<typeof decalPathSchema>;
export const defaultDecal = (): DecalSource => ({
  type: 'text',
  text: 'NIVO',
  font: 'stencil',
  spacing: 0.04,
  align: 'center',
});
export const maskStrokeSchema = z.object({
  /** Starts of disconnected spans, e.g. crossing a cylindrical UV seam. */
  breaks: z.array(z.number().int().min(1).max(1023)).max(1023).optional(),
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(1)
    .max(1024),
  radius: z.number().min(0.1).max(10000),
  strength: z.number().min(0.01).max(1),
  hardness: z.number().min(0).max(1),
  erase: z.boolean(),
});
export type MaskStroke = z.infer<typeof maskStrokeSchema>;

export function layerAssetIds(appearance?: {
  assetId?: string;
  maps?: Record<string, string | undefined>;
  layers?: { decal?: DecalSource }[];
}): string[] {
  return [
    appearance?.assetId,
    ...Object.values(appearance?.maps ?? {}),
    ...(appearance?.layers ?? []).map((l) =>
      l.decal?.type === 'image' ? l.decal.assetId : undefined,
    ),
  ].filter((id): id is string => !!id);
}
