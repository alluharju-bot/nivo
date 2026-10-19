import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { freshProject, makeBody, parseProject, projectSchema, uid, type Project } from './project';
import {
  animationSchema,
  ensureAnimationNodes,
  evaluateAnimation,
  evaluateTrack,
  putKey,
  restPose,
  rebaseAnimationPivot,
  transformAnimationNodes,
  pruneAnimation,
  crossedMarkers,
  type AnimationClip,
  type AnimationData,
  type AnimationKey,
  type Pose,
} from './animation';
import { translateSelection } from './groups';
import { mergeProject, selectionProject } from './projectImport';
import { History } from './history';
import { reconcileAnimationHierarchy } from './animationProject';
import { moveToOrigin } from './transforms';
import { shareProjectData } from './sharing';
import { sampledAnimationKeys } from '../exchange/animationExport';

const key = (
  time: number,
  pose: Pose,
  interpolation: AnimationKey['interpolation'] = 'linear',
): AnimationKey => ({ id: uid(), time, pose, interpolation });
function fixture() {
  const project = freshProject(),
    group = { id: uid(), name: 'LEFT_DOOR', hidden: false, kind: 'assembly' as const };
  const door = { ...makeBody(500, 40, 900), groupId: group.id },
    pin = { ...makeBody(10, 30, 10, [10, 0, 800]), groupId: group.id },
    right = makeBody(500, 40, 900, [500, 0, 0]);
  project.bodies = [door, pin, right];
  project.groups = [group];
  const data = ensureAnimationNodes(project);
  const groupNode = data.nodes.find((n) => n.groupId === group.id)!,
    pinNode = data.nodes.find((n) => n.bodyId === pin.id)!,
    rightNode = data.nodes.find((n) => n.bodyId === right.id)!;
  const clip: AnimationClip = {
    id: uid(),
    name: 'BLAST_DOOR_OPEN',
    duration: 3.5,
    loop: false,
    markers: [],
    tracks: [
      {
        nodeId: groupNode.id,
        keys: [
          key(0, groupNode.rest),
          key(
            1,
            {
              ...groupNode.rest,
              position: [groupNode.rest.position[0], -100, groupNode.rest.position[2]],
            },
            'smooth',
          ),
          key(3.5, { ...groupNode.rest, position: [-400, -100, groupNode.rest.position[2]] }),
        ],
      },
      {
        nodeId: pinNode.id,
        keys: [
          key(0, pinNode.rest, 'step'),
          key(0.35, {
            ...pinNode.rest,
            position: pinNode.rest.position.map((v, i) => v - (i === 2 ? 5 : 0)) as [
              number,
              number,
              number,
            ],
          }),
        ],
      },
      {
        nodeId: rightNode.id,
        keys: [key(0, rightNode.rest), key(3.5, { ...rightNode.rest, position: [1200, 20, 450] })],
      },
    ],
  };
  data.clips = [clip];
  project.animation = data;
  return { project, data, clip, door, pin, right, groupNode, pinNode, rightNode };
}
describe('mechanical animation', () => {
  it('evaluates exact key boundaries, step, linear and smooth in either time direction', () => {
    const a = restPose(),
      b = {
        ...restPose([100, 0, 0]),
        scale: [2, 3, 4] as [number, number, number],
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2).toArray(),
      };
    for (const mode of ['step', 'linear', 'smooth'] as const) {
      const keys = [key(0, a, mode), key(2, b)];
      expect(evaluateTrack(keys, -2, a)).toEqual(a);
      expect(evaluateTrack(keys, 2, a)).toEqual(b);
      expect(evaluateTrack(keys, 0.5, a).position[0]).toBeCloseTo(
        mode === 'step' ? 0 : mode === 'linear' ? 25 : 15.625,
      );
      if (mode !== 'step')
        expect(
          new Quaternion(...evaluateTrack(keys, 1, a).rotation).angleTo(
            new Quaternion(...a.rotation),
          ),
        ).toBeCloseTo(Math.PI / 4);
    }
  });
  it('composes a group with its independently animated pin without touching the base model', () => {
    const f = fixture(),
      snapshot = JSON.stringify(f.project);
    const result = evaluateAnimation(f.data, f.clip, 1);
    const door = new Vector3().applyMatrix4(result.bodyMatrices.get(f.door.id)!);
    const pin = new Vector3().applyMatrix4(result.bodyMatrices.get(f.pin.id)!);
    expect(door.y).toBeCloseTo(-120);
    expect(pin.y).toBeCloseTo(door.y);
    expect(pin.z).toBeCloseTo(-5);
    for (const t of [3.5, 1.7, 0.8, 0.35, 0, 2, 0]) evaluateAnimation(f.data, f.clip, t);
    expect(JSON.stringify(f.project)).toBe(snapshot);
    expect(
      evaluateAnimation(f.data, undefined, 0).bodyMatrices.get(f.door.id)!.equals(new Matrix4()),
    ).toBe(true);
  });
  it('stores a world gesture in parent coordinates, avoiding a double move of selected children', () => {
    const f = fixture();
    const draft = transformAnimationNodes(
      f.data,
      f.clip,
      1,
      {},
      [f.groupNode.id, f.pinNode.id],
      new Matrix4().makeTranslation(0, 20, 0),
    );
    expect(Object.keys(draft)).toEqual([f.groupNode.id]);
    const before = evaluateAnimation(f.data, f.clip, 1),
      after = evaluateAnimation(f.data, f.clip, 1, draft);
    expect(
      after.world.get(f.pinNode.id)!.elements[13] - before.world.get(f.pinNode.id)!.elements[13],
    ).toBeCloseTo(20);
  });
  it('rejects shear instead of silently baking an invalid TRS', () => {
    const f = fixture();
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4).toArray();
    expect(() =>
      transformAnimationNodes(
        f.data,
        f.clip,
        0,
        { [f.rightNode.id]: { ...f.rightNode.rest, rotation: q } },
        [f.rightNode.id],
        new Matrix4().makeScale(2, 1, 1),
      ),
    ).toThrow(/vinouttaisi/);
  });
  it('replaces at the same time, moves without duplicate IDs and validates ordering', () => {
    const f = fixture(),
      original = f.clip.tracks[0].keys[0];
    const clip = putKey(f.clip, f.groupNode.id, key(0, restPose([1, 2, 3])));
    expect(clip.tracks.map((t) => t.nodeId)).toEqual(f.clip.tracks.map((t) => t.nodeId));
    expect(clip.tracks.find((t) => t.nodeId === f.groupNode.id)!.keys[0].id).toBe(original.id);
    const moved = putKey(clip, f.groupNode.id, { ...original, time: 0.5 });
    expect(moved.tracks.find((t) => t.nodeId === f.groupNode.id)!.keys.map((k) => k.time)).toEqual([
      0.5, 1, 3.5,
    ]);
    expect(animationSchema.safeParse({ ...f.data, clips: [moved] }).success).toBe(true);
  });
  it('rebases the pivot preserving all key poses and children', () => {
    const f = fixture(),
      updated = rebaseAnimationPivot(f.data, f.groupNode.id, [0, 0, 0]);
    for (const time of [0, 1, 3.5]) {
      const before = evaluateAnimation(f.data, f.clip, time),
        after = evaluateAnimation(updated, updated.clips[0], time);
      for (const body of [f.door, f.pin])
        after.bodyMatrices
          .get(body.id)!
          .elements.forEach((n, i) =>
            expect(n).toBeCloseTo(before.bodyMatrices.get(body.id)!.elements[i], 7),
          );
    }
  });
  it('round trips, migrates v8, shares geometry through history and survives renaming', () => {
    const f = fixture(),
      restored = parseProject(JSON.stringify(f.project));
    expect(restored.animation).toEqual(f.data);
    expect(parseProject(JSON.stringify({ ...freshProject(), version: 8 })).version).toBe(9);
    const next = shareProjectData(
      f.project,
      projectSchema.parse({
        ...f.project,
        animation: { ...f.data, clips: [{ ...f.clip, name: 'OPEN' }] },
      }),
    );
    expect(next.bodies).toBe(f.project.bodies);
    const history = new History(f.project);
    history.commit(next);
    expect(history.undo().animation?.clips[0].name).toBe('BLAST_DOOR_OPEN');
    expect(history.redo().animation?.clips[0].name).toBe('OPEN');
    expect(
      projectSchema.safeParse({
        ...next,
        bodies: next.bodies.map((b) => ({ ...b, name: 'Renamed' })),
      }).success,
    ).toBe(true);
  });
  it('rejects cycles, missing nodes, duplicate targets, invalid scales and times', () => {
    const f = fixture();
    expect(
      animationSchema.safeParse({
        ...f.data,
        nodes: f.data.nodes.map((n) => ({ ...n, parentId: n.id })),
      }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({
        ...f.data,
        nodes: [...f.data.nodes, { ...f.pinNode, id: uid() }],
      }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({ ...f.data, clips: [{ ...f.clip, duration: 0.2 }] }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({
        ...f.data,
        clips: [{ ...f.clip, tracks: [{ nodeId: 'missing', keys: [] }] }],
      }).success,
    ).toBe(false);
  });
  it('preserves ancestor motion after deleting a parent body and remaps imported IDs', () => {
    const f = fixture();
    const data = pruneAnimation(f.data, [f.pin, f.right], [])!;
    expect(data.nodes.find((n) => n.id === f.groupNode.id)?.groupId).toBeUndefined();
    expect(
      evaluateAnimation(data, data.clips[0], 1).bodyMatrices.get(f.pin.id)!.elements[14],
    ).toBeCloseTo(-5);
    const merged = mergeProject(freshProject(), f.project).project;
    expect(projectSchema.safeParse(merged).success).toBe(true);
    expect(merged.animation!.nodes.every((n) => !f.data.nodes.some((o) => o.id === n.id))).toBe(
      true,
    );
    expect(
      selectionProject(f.project, [f.door.id, f.pin.id], 'Door').animation!.clips[0].tracks,
    ).toHaveLength(2);
  });
  it('copies animated assemblies and carries their pivots when the base model moves', () => {
    const f = fixture();
    const moved = translateSelection(f.project, [f.door.id, f.pin.id], [100, 0, 0]).project;
    const old = evaluateAnimation(f.data, f.clip, 1),
      next = evaluateAnimation(moved.animation!, moved.animation!.clips[0], 1);
    expect(
      next.world.get(f.groupNode.id)!.elements[12] - old.world.get(f.groupNode.id)!.elements[12],
    ).toBeCloseTo(100);
    const copy = translateSelection(
      f.project,
      [f.door.id, f.pin.id],
      [1000, 0, 0],
      true,
      f.groupNode.groupId,
    ).project;
    expect(projectSchema.safeParse(copy).success).toBe(true);
    expect(copy.animation!.clips[0].tracks).toHaveLength(5);
  });
  it('keeps independent motion when reparented into a static folder and protects inherited motion', () => {
    const f = fixture();
    const folder = { id: uid(), name: 'Root', hidden: false, kind: 'folder' as const };
    const next = reconcileAnimationHierarchy(f.project, {
      ...f.project,
      groups: [...f.project.groups, folder],
      bodies: f.project.bodies.map((b) => (b.id === f.right.id ? { ...b, groupId: folder.id } : b)),
    });
    const n = next.animation!.nodes.find((n) => n.bodyId === f.right.id)!;
    expect(n.parentId).toBe(next.animation!.nodes.find((n) => n.groupId === folder.id)!.id);
    for (const t of [0, 1, 3.5]) {
      const old = evaluateAnimation(f.data, f.clip, t).bodyMatrices.get(f.right.id)!;
      const after = evaluateAnimation(
        next.animation!,
        next.animation!.clips[0],
        t,
      ).bodyMatrices.get(f.right.id)!;
      after.elements.forEach((v, i) => expect(v).toBeCloseTo(old.elements[i], 8));
    }
    expect(() =>
      reconcileAnimationHierarchy(f.project, {
        ...f.project,
        bodies: f.project.bodies.map((b) => (b.id === f.pin.id ? { ...b, groupId: undefined } : b)),
      }),
    ).toThrow(/perimää animaatiota/);
    const origin = moveToOrigin(f.project, [f.right.id], 'min');
    expect(
      evaluateAnimation(origin.animation!, origin.animation!.clips[0], 3.5).world.get(
        f.rightNode.id,
      )!.elements[12],
    ).toBeCloseTo(700);
  });
  it('samples smooth TRS within error bounds and documents mixed step transitions', () => {
    const a = restPose(),
      b = {
        ...restPose([100, 80, 10]),
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2).toArray(),
      };
    const keys = [key(0, a, 'smooth'), key(3.5, b)],
      samples = sampledAnimationKeys(keys, a, 3.5);
    expect(samples.times.length).toBeGreaterThan(10);
    const exported = samples.times.map((t, i) => key(t, samples.poses[i]));
    for (let i = 0; i < 199; i++) {
      const t = (i / 198) * 3.5,
        p = evaluateTrack(keys, t, a),
        q = evaluateTrack(exported, t, a);
      expect(new Vector3(...p.position).distanceTo(new Vector3(...q.position))).toBeLessThan(0.011);
      expect(new Quaternion(...p.rotation).angleTo(new Quaternion(...q.rotation))).toBeLessThan(
        0.00011,
      );
    }
    expect(
      sampledAnimationKeys([key(0, a, 'step'), key(1, b), key(2, a)], a, 2).jumpTolerance,
    ).toBeGreaterThan(0);
    expect(sampledAnimationKeys([key(0, a, 'step'), key(1, b)], a, 1).step).toBe(true);
  });
  it('emits runtime markers only for crossed intervals; seeking is inert', () => {
    const { clip } = fixture();
    clip.markers = [{ id: 'release', name: 'LOCK_RELEASE', time: 0.35 }];
    expect(crossedMarkers(clip, 0, 1)).toHaveLength(1);
    expect(crossedMarkers(clip, 1, 0)).toHaveLength(1);
    expect(crossedMarkers(clip, 0, 1, true)).toEqual([]);
    expect(crossedMarkers(clip, 0.35, 1)).toEqual([]);
  });
});
