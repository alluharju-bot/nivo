import { z } from 'zod';
import { frameSchema, frameV } from './sketch';
import { add, scale } from './geometry';

export const referenceImageSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  assetId: z.string().min(1).max(100),
  frame: frameSchema,
  width: z.number().finite().min(0.1).max(100000),
  height: z.number().finite().min(0.1).max(100000),
  opacity: z.number().min(0.05).max(1).default(0.5),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  calibrated: z.boolean().default(false),
});
export type ReferenceImage = z.infer<typeof referenceImageSchema>;
/** Image points are normalized from the top left. Keep the first point fixed in world space. */
export function calibrateImage(
  image: ReferenceImage,
  a: [number, number],
  b: [number, number],
  distance: number,
): ReferenceImage {
  const measured = Math.hypot((b[0] - a[0]) * image.width, (b[1] - a[1]) * image.height);
  if (measured < 1e-6 || !Number.isFinite(distance) || distance <= 0)
    throw new Error('Valitse kaksi eri pistettä ja anna tunnettu mitta.');
  const width = (image.width * distance) / measured,
    height = (image.height * distance) / measured;
  if (width < 0.1 || height < 0.1 || width > 100000 || height > 100000)
    throw new Error('Kalibroidun kuvan leveyden ja korkeuden tulee olla 0,1–100 000 mm.');
  return referenceImageSchema.parse({
    ...image,
    width,
    height,
    calibrated: true,
    locked: true,
    frame: {
      ...image.frame,
      origin: add(
        image.frame.origin,
        add(
          scale(image.frame.u, a[0] * (image.width - width)),
          scale(frameV(image.frame), (1 - a[1]) * (image.height - height)),
        ),
      ),
    },
  });
}
