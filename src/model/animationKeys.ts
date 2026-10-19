import type { AnimationClip, AnimationKey } from './animationSchema';

/** Key IDs are unique within a track, so selection always includes its node. */
export interface AnimationKeyRef {
  nodeId: string;
  keyId: string;
}
export const animationKeyToken = (ref: AnimationKeyRef) => JSON.stringify([ref.nodeId, ref.keyId]);
export function selectedAnimationKeys(clip: AnimationClip, refs: AnimationKeyRef[]) {
  const chosen = new Set(refs.map(animationKeyToken));
  return clip.tracks.flatMap((track) =>
    track.keys.flatMap((key) => {
      const ref = { nodeId: track.nodeId, keyId: key.id };
      return chosen.has(animationKeyToken(ref)) ? [{ ...ref, key }] : [];
    }),
  );
}

/** One common delta: never clamp keys individually or overwrite neighbouring keys. */
export function shiftAnimationKeys(
  clip: AnimationClip,
  refs: AnimationKeyRef[],
  requested: number,
) {
  if (!Number.isFinite(requested)) throw new Error('Anna siirtymä sekunteina.');
  const entries = selectedAnimationKeys(clip, refs);
  if (!entries.length) return { clip, delta: 0 };
  const min = entries.reduce((n, e) => Math.min(n, e.key.time), Infinity);
  const max = entries.reduce((n, e) => Math.max(n, e.key.time), -Infinity);
  const delta = Math.max(-min, Math.min(3600 - max, requested));
  if (!delta) return { clip, delta };
  const chosen = new Set(entries.map(animationKeyToken));
  const tracks = clip.tracks.map((track) => {
    let changed = false;
    const keys = track.keys.map((key) => {
      if (!chosen.has(animationKeyToken({ nodeId: track.nodeId, keyId: key.id }))) return key;
      changed = true;
      return { ...key, time: Math.max(0, Math.min(3600, key.time + delta)) };
    });
    if (!changed) return track;
    keys.sort((a, b) => a.time - b.time);
    if (keys.some((key, i) => i > 0 && key.time - keys[i - 1].time < 1e-6))
      throw new Error(
        'Samalla raidalla on jo avain tässä ajassa. Siirrä valintaa hieman; avaimia ei korvattu.',
      );
    return { ...track, keys };
  });
  return { clip: { ...clip, tracks, duration: Math.max(clip.duration, max + delta) }, delta };
}

export function editAnimationKeys(
  clip: AnimationClip,
  refs: AnimationKeyRef[],
  edit: (key: AnimationKey) => AnimationKey | undefined,
): AnimationClip {
  const chosen = new Set(refs.map(animationKeyToken));
  return {
    ...clip,
    tracks: clip.tracks
      .map((track) => ({
        ...track,
        keys: track.keys.flatMap((key) => {
          if (!chosen.has(animationKeyToken({ nodeId: track.nodeId, keyId: key.id }))) return [key];
          const next = edit(key);
          return next ? [next] : [];
        }),
      }))
      .filter((track) => track.keys.length),
  };
}
