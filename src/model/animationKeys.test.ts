import { describe, expect, it } from 'vitest';
import { restPose, animationSchema, type AnimationClip } from './animation';
import {
  selectedAnimationKeys,
  shiftAnimationKeys,
  editAnimationKeys,
  type AnimationKeyRef,
} from './animationKeys';
import { freshProject } from './project';
import { History } from './history';

const ref = (nodeId: string, keyId: string): AnimationKeyRef => ({ nodeId, keyId });
function fixture(count = 2): AnimationClip {
  return {
    id: 'clip',
    name: 'Door',
    duration: 4,
    loop: false,
    markers: [{ id: 'sound', name: 'OPEN', time: 2 }],
    tracks: Array.from({ length: count }, (_, i) => ({
      nodeId: `door-${i}`,
      keys: [0, 1, 2, 4].map((time, j) => ({
        id: `key-${j}`,
        time: time + (j === 1 ? i * 0.001 : 0),
        pose: restPose([i, 0, j]),
        interpolation: 'smooth' as const,
      })),
    })),
  };
}
describe('animation key selection', () => {
  it('moves ten tracks by one delta, preserving gaps, IDs, poses, ordering and unselected keys', () => {
    const clip = fixture(10),
      original = structuredClone(clip);
    const refs = clip.tracks.flatMap((t) => [ref(t.nodeId, 'key-1'), ref(t.nodeId, 'key-2')]);
    const result = shiftAnimationKeys(clip, refs, 0.625);
    expect(result.delta).toBe(0.625);
    expect(clip).toEqual(original);
    for (const [i, t] of result.clip.tracks.entries()) {
      expect(t.keys.map((k) => k.id)).toEqual(['key-0', 'key-1', 'key-2', 'key-3']);
      expect(t.keys[1].time).toBeCloseTo(1 + i * 0.001 + 0.625, 12);
      expect(t.keys[2].time).toBe(2.625);
      expect(t.keys[1].pose).toBe(clip.tracks[i].keys[1].pose);
      expect(t.keys[0]).toBe(clip.tracks[i].keys[0]);
      expect(t.keys[3]).toBe(clip.tracks[i].keys[3]);
    }
    expect(result.clip.markers).toBe(clip.markers);
  });
  it('extends the duration and clamps the whole selection at zero and at the schema maximum', () => {
    const clip = fixture();
    const refs = [ref('door-0', 'key-3'), ref('door-1', 'key-2')];
    const next = shiftAnimationKeys(clip, refs, 1).clip;
    expect(next.duration).toBe(5);
    const min = shiftAnimationKeys(
      {
        ...clip,
        tracks: clip.tracks.map((t) => ({ ...t, keys: t.keys.filter((k) => k.id !== 'key-0') })),
      },
      [ref('door-0', 'key-1'), ref('door-1', 'key-1')],
      -20,
    );
    expect(min.delta).toBe(-1);
    expect(min.clip.tracks[0].keys[0].time).toBe(0);
    expect(min.clip.tracks[1].keys[0].time).toBeCloseTo(0.001, 12);
    const max = shiftAnimationKeys(clip, refs, 4000);
    expect(max.delta).toBe(3596);
    expect(max.clip.duration).toBe(3600);
    expect(max.clip.tracks[1].keys.at(-1)!.time).toBe(3598);
  });
  it('rejects collisions atomically, including near-coincident times, without overwriting either key', () => {
    const clip = fixture(),
      original = structuredClone(clip);
    for (const delta of [1, 1 - 1e-7])
      expect(() =>
        shiftAnimationKeys(clip, [ref('door-0', 'key-1'), ref('door-1', 'key-1')], delta),
      ).toThrow(/jo avain/);
    expect(clip).toEqual(original);
    expect(() => shiftAnimationKeys(clip, [ref('door-0', 'key-1')], NaN)).toThrow();
    expect(shiftAnimationKeys(clip, [], 1).clip).toBe(clip);
  });
  it('can cross an unselected key without losing it and distinguishes identical IDs on different tracks', () => {
    const clip = fixture();
    const result = shiftAnimationKeys(clip, [ref('door-0', 'key-1')], 1.5).clip;
    expect(result.tracks[0].keys.map((k) => k.time)).toEqual([0, 2, 2.5, 4]);
    expect(result.tracks[1]).toBe(clip.tracks[1]);
    expect(
      selectedAnimationKeys(clip, [ref('door-0', 'key-1'), ref('door-0', 'key-1')]),
    ).toHaveLength(1);
    expect(
      editAnimationKeys(clip, [ref('door-0', 'key-1')], () => undefined).tracks[1].keys,
    ).toHaveLength(4);
  });
  it('edits interpolation and removes a multi-track selection with one reversible history action', () => {
    const clip = fixture();
    const refs = [ref('door-0', 'key-1'), ref('door-1', 'key-2')];
    const edited = editAnimationKeys(clip, refs, (k) => ({ ...k, interpolation: 'step' }));
    expect(selectedAnimationKeys(edited, refs).map((e) => e.key.interpolation)).toEqual([
      'step',
      'step',
    ]);
    const data = animationSchema.parse({
      version: 1,
      nodes: clip.tracks.map((t) => ({ id: t.nodeId, name: t.nodeId, rest: restPose() })),
      clips: [clip],
    });
    const p = { ...freshProject(), animation: data },
      history = new History(p);
    const moved = shiftAnimationKeys(clip, refs, 0.5).clip;
    history.commit({ ...p, animation: { ...data, clips: [moved] } });
    expect(history.undoCount).toBe(1);
    expect(history.undo().animation!.clips[0]).toEqual(clip);
    expect(history.redo().animation!.clips[0]).toEqual(moved);
    const removed = editAnimationKeys(clip, refs, () => undefined);
    expect(selectedAnimationKeys(removed, refs)).toEqual([]);
    expect(removed.tracks.map((t) => t.keys.length)).toEqual([3, 3]);
  });
});
