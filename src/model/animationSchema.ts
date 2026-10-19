import { z } from 'zod';
const id = z.string().min(1).max(100);
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const quaternion = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-5, 'Animaation kierto ei ole kelvollinen.');
export const poseSchema = z.object({
  position: vector.refine(
    (v) => v.every((n) => Math.abs(n) <= 10_000_000),
    'Animaation sijainti on liian kaukana.',
  ),
  rotation: quaternion,
  scale: vector.refine(
    (v) => v.every((n) => n >= 0.0001 && n <= 10000),
    'Animaation skaala on liian pieni tai suuri.',
  ),
});
export const animationNodeSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  bodyId: id.optional(),
  groupId: id.optional(),
  parentId: id.optional(),
  rest: poseSchema,
});
export const animationKeySchema = z.object({
  id,
  time: z.number().finite().min(0).max(3600),
  pose: poseSchema,
  interpolation: z.enum(['step', 'linear', 'smooth']),
});
export const animationClipSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  duration: z.number().finite().min(0.01).max(3600),
  loop: z.boolean(),
  tracks: z
    .array(z.object({ nodeId: id, keys: z.array(animationKeySchema).max(10000) }))
    .max(10000),
  markers: z
    .array(
      z.object({ id, time: z.number().finite().min(0), name: z.string().trim().min(1).max(120) }),
    )
    .max(1000)
    .default([]),
});
export const animationSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(animationNodeSchema).max(20000),
    clips: z.array(animationClipSchema).max(200),
  })
  .superRefine((data, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    for (const list of [data.nodes, data.clips])
      if (new Set(list.map((n) => n.id)).size !== list.length)
        issue('Animaation tunniste toistuu.');
    for (const field of ['bodyId', 'groupId'] as const) {
      const targets = data.nodes.map((n) => n[field]).filter(Boolean);
      if (new Set(targets).size !== targets.length)
        issue('Samalla kohteella voi olla vain yksi animaatiosolmu.');
    }
    for (const n of data.nodes) {
      if (n.bodyId && n.groupId) issue('Animaatiosolmun kohde on osa tai ryhmä.');
      const seen = new Set([n.id]);
      let parent = n.parentId;
      while (parent) {
        if (!nodes.has(parent) || seen.has(parent) || seen.size > 128) {
          issue('Animaation parent-ketju puuttuu tai muodostaa silmukan.');
          break;
        }
        seen.add(parent);
        parent = nodes.get(parent)!.parentId;
      }
    }
    for (const clip of data.clips) {
      if (new Set(clip.tracks.map((t) => t.nodeId)).size !== clip.tracks.length)
        issue('Osalla voi olla vain yksi raita klipissä.');
      for (const track of clip.tracks) {
        if (!nodes.has(track.nodeId)) issue('Animaatioraidan kohde puuttuu.');
        if (new Set(track.keys.map((k) => k.id)).size !== track.keys.length)
          issue('Avaimen tunniste toistuu.');
        for (let i = 0; i < track.keys.length; i++) {
          const k = track.keys[i];
          if (k.time > clip.duration || (i && k.time <= track.keys[i - 1].time))
            issue('Avainten aikojen pitää kasvaa ja mahtua klippiin.');
        }
      }
      if (
        new Set(clip.markers.map((m) => m.id)).size !== clip.markers.length ||
        clip.markers.some((m) => m.time > clip.duration)
      )
        issue('Tapahtumamerkin tunniste tai aika on virheellinen.');
    }
  });
export type AnimationData = z.infer<typeof animationSchema>;
export type AnimationNode = z.infer<typeof animationNodeSchema>;
export type AnimationClip = z.infer<typeof animationClipSchema>;
export type AnimationKey = z.infer<typeof animationKeySchema>;
export type Pose = z.infer<typeof poseSchema>;
export type PoseMap = Record<string, Pose>;
