import { z } from 'zod';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Body, Project, Vec3 } from './project';

const id = z.string().min(1).max(100);
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
/** Pivot and axis are in the anchor's rigid local frame, in mm, Z up. */
export const motionSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    kind: z.enum(['hinge', 'slide']),
    anchorId: id,
    movingIds: z.array(id).min(1).max(10000),
    pivot: vector.refine((p) => p.every((n) => Math.abs(n) <= 200000), 'Pivot on liian kaukana.'),
    axis: vector.refine((v) => Math.abs(Math.hypot(...v) - 1) < 1e-6, 'Valitse liikkeen suunta.'),
    amount: z.number().finite().min(-100000).max(100000),
    duration: z.number().finite().min(0.1).max(30),
    easing: z.enum(['smooth', 'linear']),
  })
  .superRefine((m, ctx) => {
    if (m.movingIds.includes(m.anchorId) || new Set(m.movingIds).size !== m.movingIds.length)
      ctx.addIssue({ code: 'custom', message: 'Ankkuri ja liikkuvat osat on valittava erikseen.' });
    if (m.kind === 'hinge' && Math.abs(m.amount) > 360)
      ctx.addIssue({ code: 'custom', message: 'Saranan avautuminen voi olla enintään 360°.' });
  });
export type Motion = z.infer<typeof motionSchema>;
export type MotionPick = 'anchor' | 'moving' | 'pivot' | 'axis';
export interface MotionHit {
  point: Vec3;
  bodyId?: string;
  axis?: Vec3;
}
export interface MotionPlayback {
  serial: number;
  targets: Record<string, number>;
  immediate?: boolean;
  onlyId?: string;
}
export interface MotionViewport {
  motions: Motion[];
  bodies: Body[];
  activeId?: string;
  picking?: MotionPick;
  playback: MotionPlayback;
  onPick: (hit: MotionHit) => void;
  onActive: (id: string) => void;
}

export function anchorFrame(body: Body) {
  return new Matrix4().compose(
    new Vector3(...body.origin).add(new Vector3(...(body.textureFrame?.offset ?? [0, 0, 0]))),
    new Quaternion(...(body.textureFrame?.rotation ?? [0, 0, 0, 1])).normalize(),
    new Vector3(1, 1, 1),
  );
}
export function motionWorld(motion: Motion, anchor: Body) {
  const frame = anchorFrame(anchor);
  return {
    pivot: new Vector3(...motion.pivot).applyMatrix4(frame).toArray() as Vec3,
    axis: new Vector3(...motion.axis).transformDirection(frame).toArray() as Vec3,
  };
}
export function setMotionWorld(motion: Motion, anchor: Body, pivot: Vec3, axis: Vec3): Motion {
  const inverse = anchorFrame(anchor).invert();
  return {
    ...motion,
    pivot: new Vector3(...pivot).applyMatrix4(inverse).toArray() as Vec3,
    axis: new Vector3(...axis).transformDirection(inverse).toArray() as Vec3,
  };
}
/** One driver per part; anchors may themselves move in an acyclic hierarchy. */
export function motionError(motions: Motion[], bodies: Pick<Body, 'id'>[]) {
  const ids = new Set(bodies.map((b) => b.id)),
    owner = new Map<string, Motion>();
  for (const m of motions) {
    if (!ids.has(m.anchorId) || m.movingIds.some((id) => !ids.has(id)))
      return 'Liikkeen ankkuri tai liikkuva osa puuttuu.';
    for (const id of m.movingIds) {
      if (id === m.anchorId) return 'Ankkuri ei voi olla saman liikkeen liikkuva osa.';
      if (owner.has(id)) return 'Osa kuuluu jo toiseen liikkeeseen. Muokkaa sen nykyistä pivotia.';
      owner.set(id, m);
    }
  }
  for (const m of motions) {
    const seen = new Set<string>();
    let next: Motion | undefined = m;
    while (next) {
      if (seen.has(next.id)) return 'Pivotit eivät voi muodostaa kiertävää ankkuriketjua.';
      seen.add(next.id);
      next = owner.get(next.anchorId);
    }
  }
}
/** Deletes cannot leave dangling pivot references. Undo restores definitions too. */
export function pruneMotions(motions: Project['motions'], bodies: Body[]) {
  if (!motions) return motions;
  const ids = new Set(bodies.map((b) => b.id));
  return motions
    .filter((m) => ids.has(m.anchorId))
    .map((m) => ({
      ...m,
      movingIds: m.movingIds.filter((id) => ids.has(id)),
    }))
    .filter((m) => m.movingIds.length);
}
export function easeMotion(t: number, easing: Motion['easing']) {
  const n = Math.min(1, Math.max(0, t));
  return easing === 'smooth' ? n * n * (3 - 2 * n) : n;
}
export function motionDelta(pivot: Vec3, axis: Vec3, kind: Motion['kind'], amount: number) {
  if (kind === 'slide')
    return new Matrix4().makeTranslation(...(axis.map((n) => n * amount) as Vec3));
  return new Matrix4()
    .makeTranslation(...pivot)
    .multiply(new Matrix4().makeRotationAxis(new Vector3(...axis), (amount * Math.PI) / 180))
    .multiply(new Matrix4().makeTranslation(...(pivot.map((n) => -n) as Vec3)));
}
export function motionTransforms(
  motions: Motion[],
  bodies: Body[],
  positions: Record<string, number>,
) {
  const parts = new Map(bodies.map((b) => [b.id, b]));
  const owner = new Map(motions.flatMap((m) => m.movingIds.map((id) => [id, m] as const)));
  const transforms = new Map<string, Matrix4>(),
    pending = new Set<string>();
  const joints = new Map<string, Matrix4>(),
    identity = new Matrix4();
  const resolve = (id: string): Matrix4 => {
    const cached = transforms.get(id);
    if (cached) return cached;
    const m = owner.get(id),
      anchor = m && parts.get(m.anchorId);
    if (!m || !anchor || pending.has(id)) return identity;
    const shared = joints.get(m.id);
    if (shared) {
      transforms.set(id, shared);
      return shared;
    }
    pending.add(id);
    const parent = resolve(m.anchorId),
      world = motionWorld(m, anchor);
    const result = parent
      .clone()
      .multiply(motionDelta(world.pivot, world.axis, m.kind, m.amount * (positions[m.id] ?? 0)));
    pending.delete(id);
    transforms.set(id, result);
    joints.set(m.id, result);
    return result;
  };
  owner.forEach((_m, id) => resolve(id));
  return transforms;
}
