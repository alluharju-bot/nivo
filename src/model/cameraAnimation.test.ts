import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  cameraKeySchema,
  evaluateCamera,
  putCameraKey,
  validateCameraTrack,
  type CameraKey,
  type CameraTrack,
} from './cameraAnimation';
import { freshProject, makeBody, parseProject, projectSchema } from './project';
import { ensureAnimationNodes, evaluateAnimation, restPose } from './animation';
import { mergeProject, reidentifyProject } from './projectImport';
import { History } from './history';
import { readFileSync } from 'node:fs';

const key = (id: string, time: number, x: number, patch: Partial<CameraKey> = {}): CameraKey => ({
  id,
  name: id,
  time,
  position: [x, -4000, 1600],
  target: [x, 0, 1600],
  focalLength: 35,
  hold: 1,
  interpolation: 'smooth',
  ...patch,
});
const route = (): CameraTrack => ({ keys: [key('a', 0, 0), key('b', 4, 2000), key('c', 8, 4000)] });

describe('camera routes', () => {
  it('honors independent zoom delay/duration and preserves the finished zoom for the rest of the stop', () => {
    const a = key('a', 0, 0, {
      hold: 6,
      zoom: { target: [600, 0, 1600], focalLength: 85, start: 2, duration: 2 },
    });
    const track = { keys: [a] };
    expect(evaluateCamera(track, 1)!.focalLength).toBe(35);
    expect(evaluateCamera(track, 3)!.focalLength).toBe(60);
    expect(evaluateCamera(track, 5)!.focalLength).toBe(85);
    expect(validateCameraTrack(track, 6)).toBeUndefined();
    expect(validateCameraTrack({ keys: [{ ...a, hold: 3 }] }, 6)).toMatch(/Zoomin/);
    expect(cameraKeySchema.safeParse({ ...a, zoom: { ...a.zoom, duration: 0 } }).success).toBe(
      false,
    );
  });
  it('holds exact arrivals and clamps outside the timeline', () => {
    const track = route();
    expect(evaluateCamera(undefined, 0)).toBeUndefined();
    expect(evaluateCamera(track, -1)?.position).toEqual(track.keys[0].position);
    for (const k of track.keys)
      for (const time of [k.time, k.time + 0.5, k.time + k.hold]) {
        expect(evaluateCamera(track, time)?.position).toEqual(k.position);
      }
    expect(evaluateCamera(track, 100)?.position).toEqual(track.keys[2].position);
    expect(evaluateCamera(track, 2.5)?.position[0]).toBeCloseTo(1000);
  });
  it('zooms and turns during a stationary stop, then continues without a jump', () => {
    const a = key('a', 0, 0, { hold: 2, zoom: { target: [600, 0, 1600], focalLength: 90 } });
    const track = { keys: [a, key('b', 6, 3000)] };
    const middle = evaluateCamera(track, 1)!;
    expect(middle.position).toEqual(a.position);
    expect(middle.focalLength).toBeCloseTo(62.5);
    const end = evaluateCamera(track, 2)!;
    expect(end.focalLength).toBe(90);
    expect(new Vector3(...end.target).distanceTo(new Vector3(...a.zoom!.target))).toBeLessThan(
      1e-8,
    );
    expect(
      new Vector3(...evaluateCamera(track, 2.00001)!.position).distanceTo(
        new Vector3(...end.position),
      ),
    ).toBeLessThan(0.001);
    expect(evaluateCamera(track, 6)!.focalLength).toBe(35);
  });
  it('keeps a valid look direction even when two targets face opposite ways', () => {
    const a = key('a', 0, 0, { hold: 0 }),
      b = key('b', 2, 0, { target: [0, -8000, 1600] });
    const track = { keys: [a, b] };
    for (let t = 0; t <= 2; t += 0.05) {
      const pose = evaluateCamera(track, t)!;
      expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
      expect(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))).toBeCloseTo(
        4000,
      );
    }
  });
  it('handles duplicate camera positions and reverse scrubbing deterministically', () => {
    const track = { keys: [key('a', 0, 0), key('b', 4, 0), key('c', 8, 3000)] };
    const forward = Array.from({ length: 91 }, (_, i) => evaluateCamera(track, i / 10));
    for (let i = 90; i >= 0; i--) {
      expect(evaluateCamera(track, i / 10)).toEqual(forward[i]);
      expect(forward[i]!.position.every(Number.isFinite)).toBe(true);
    }
  });
  it('uses a straight constant-speed segment when explicitly selected', () => {
    const track = {
      keys: [key('a', 0, 0, { interpolation: 'linear', hold: 0 }), key('b', 4, 2000)],
    };
    expect(evaluateCamera(track, 1)?.position[0]).toBeCloseTo(500);
    expect(evaluateCamera(track, 3)?.position[0]).toBeCloseTo(1500);
  });
  it('atomically rejects overlapping stops, duplicate times, bad lenses and nonfinite coordinates', () => {
    const track = route(),
      saved = JSON.stringify(track);
    expect(() => putCameraKey(track, key('bad', 0.5, 100), 9)).toThrow(/aikaa/);
    expect(() => putCameraKey(track, key('bad', 4, 100), 9)).toThrow(/aikaa/);
    expect(() => putCameraKey(track, key('bad', 3600, 100), 9)).toThrow();
    expect(cameraKeySchema.safeParse(key('bad', 0, NaN)).success).toBe(false);
    expect(cameraKeySchema.safeParse(key('bad', 0, 0, { focalLength: 300 })).success).toBe(false);
    expect(
      cameraKeySchema.safeParse(
        key('bad', 0, 0, { zoom: { target: [1e100, 0, 0], focalLength: 65 } }),
      ).success,
    ).toBe(false);
    expect(cameraKeySchema.safeParse(key('bad', 0, 0, { target: [0, -4000, 1600] })).success).toBe(
      false,
    );
    expect(validateCameraTrack(track, 8)).toMatch(/kestoon/);
    expect(JSON.stringify(track)).toBe(saved);
    const added = putCameraKey(track, key('d', 10, 1000, { hold: 3 }), 9);
    expect(added.duration).toBe(13);
    expect(added.camera.keys).toHaveLength(4);
  });
});

function project() {
  const p = { ...freshProject(), bodies: [makeBody(100, 100, 100)] };
  const data = ensureAnimationNodes(p);
  return projectSchema.parse({
    ...p,
    animation: {
      ...data,
      version: 2,
      clips: [
        {
          id: 'tour',
          name: 'Tour',
          duration: 9,
          loop: false,
          markers: [],
          camera: route(),
          tracks: [
            {
              nodeId: data.nodes[0].id,
              keys: [
                { id: 'object-key', time: 0, interpolation: 'linear', pose: restPose([400, 0, 0]) },
              ],
            },
          ],
        },
      ],
    },
  });
}
describe('camera persistence and existing actor animation', () => {
  it('loads the supplied room with four scenes and independent door tracks', () => {
    const demo = parseProject(
      readFileSync(new URL('../../public/examples/kamerakierros.nivo', import.meta.url), 'utf8'),
    );
    expect(demo.animation!.clips[0].camera!.keys).toHaveLength(4);
    expect(demo.animation!.clips[0].tracks).toHaveLength(2);
    expect(demo.bodies.length).toBeGreaterThan(20);
    expect(JSON.stringify(demo)).not.toContain('?');
  });
  it('undoes and redoes the complete camera edit as one project transaction', () => {
    const before = project(),
      history = new History(before);
    const clip = before.animation!.clips[0];
    const changed = putCameraKey(
      clip.camera,
      { ...clip.camera!.keys[0], name: 'Entrance' },
      clip.duration,
    );
    history.commit({
      ...before,
      animation: { ...before.animation!, clips: [{ ...clip, ...changed }] },
    });
    expect(history.undo().animation!.clips[0].camera).toEqual(clip.camera);
    expect(history.redo().animation!.clips[0].camera!.keys[0].name).toBe('Entrance');
  });
  it('round trips v2, still opens v1, and refuses silent use of camera keys under v1', () => {
    const p = project();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(
      projectSchema.safeParse({ ...p, animation: { ...p.animation, version: 1 } }).success,
    ).toBe(false);
    const old = {
      ...p,
      animation: {
        ...p.animation!,
        version: 1 as const,
        clips: p.animation!.clips.map((c) => ({ ...c, camera: undefined })),
      },
    };
    expect(parseProject(JSON.stringify(old)).animation!.version).toBe(1);
  });
  it('preserves camera routes when merging/reidentifying projects', () => {
    const p = project();
    const clone = reidentifyProject(p);
    expect(clone.animation!.clips[0].camera!.keys[0].id).not.toBe('a');
    const merged = mergeProject(freshProject(), p).project;
    expect(merged.animation!.version).toBe(2);
    expect(merged.animation!.clips[0].camera!.keys.map((k) => k.position)).toEqual(
      route().keys.map((k) => k.position),
    );
  });
  it('evaluates actors and camera without mutating the project', () => {
    const p = project(),
      before = JSON.stringify(p);
    for (let t = 0; t < 9; t += 0.1) {
      expect(evaluateAnimation(p.animation!, p.animation!.clips[0], t).bodyMatrices.size).toBe(1);
      expect(evaluateCamera(p.animation!.clips[0].camera, t)).toBeDefined();
    }
    expect(JSON.stringify(p)).toBe(before);
  });
});
