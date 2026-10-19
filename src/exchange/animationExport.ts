import {
  AnimationClip as ThreeClip,
  Group,
  InterpolateDiscrete,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import {
  animationNodeName,
  evaluateAnimation,
  evaluateTrack,
  interpolatePose,
  matrixPose,
  nodeBodyIds,
  pruneAnimation,
  type AnimationClip,
  type AnimationData,
  type AnimationKey,
  type Pose,
} from '../model/animation';
import type { Body, BodyGroup } from '../model/project';
import { easeMotion, motionError, motionTransforms, type Motion } from '../model/motion';

const poseError = (a: Pose, b: Pose) =>
  Math.max(
    Math.hypot(...a.position.map((v, i) => v - b.position[i])) / 0.01,
    new Quaternion(...a.rotation).angleTo(new Quaternion(...b.rotation)) / 0.0001,
    Math.max(...a.scale.map((v, i) => Math.abs(v - b.scale[i]))) / 0.00001,
  );
/** glTF samples are checked between keys, including quarter-points of smoothstep. */
export function sampledAnimationKeys(keys: AnimationKey[], rest: Pose, duration: number) {
  const step = keys.length > 1 && keys.slice(0, -1).every((k) => k.interpolation === 'step');
  const times = new Set<number>([0, duration, ...keys.map((k) => k.time)]);
  let jumpTolerance = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i],
      b = keys[i + 1];
    if (a.interpolation === 'step' && !step) {
      const epsilon = Math.min((b.time - a.time) / 4, Math.max(0.00001, b.time * 2 ** -21));
      times.add(b.time - epsilon);
      jumpTolerance = Math.max(jumpTolerance, epsilon);
      continue;
    }
    if (a.interpolation !== 'smooth') continue;
    const split = (from: number, to: number, depth: number) => {
      const p = evaluateTrack(keys, from, rest),
        q = evaluateTrack(keys, to, rest);
      const error = Math.max(
        ...[0.25, 0.5, 0.75].map((t) =>
          poseError(evaluateTrack(keys, from + (to - from) * t, rest), interpolatePose(p, q, t)),
        ),
      );
      if (error <= 1) return;
      if (depth >= 16) throw new Error('Animaation vientitarkkuus ei riitä. Lyhennä avainväliä.');
      const middle = (from + to) / 2;
      times.add(middle);
      split(from, middle, depth + 1);
      split(middle, to, depth + 1);
    };
    split(a.time, b.time, 0);
  }
  const sorted = [...times].sort((a, b) => a - b);
  // Float32 times must remain strictly increasing in the actual glTF accessor.
  if (sorted.some((t, i) => i > 0 && Math.fround(t) <= Math.fround(sorted[i - 1])))
    throw new Error('Avainten ajat ovat liian lähellä toisiaan GLB-vientiä varten.');
  const poses = sorted.map((time) => evaluateTrack(keys, time, rest));
  for (let i = 1; i < poses.length; i++)
    if (new Quaternion(...poses[i - 1].rotation).dot(new Quaternion(...poses[i].rotation)) < 0)
      poses[i] = { ...poses[i], rotation: poses[i].rotation.map((n) => -n) as Pose['rotation'] };
  return { times: sorted, poses, step, jumpTolerance };
}
function legacyClips(data: AnimationData, bodies: Body[], motions: Motion[]): AnimationClip[] {
  const error = motionError(motions, bodies);
  if (error) throw new Error(error);
  const rest = evaluateAnimation(data, undefined, 0);
  return motions.flatMap((m) =>
    [false, true].map((closing) => {
      const tracks = new Map<string, AnimationKey[]>();
      const steps = Math.max(24, Math.ceil(m.duration * 30));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          progress = easeMotion(t, m.easing),
          deltas = motionTransforms(motions, bodies, { [m.id]: closing ? 1 - progress : progress });
        for (const node of data.nodes) {
          if (!node.bodyId || !deltas.has(node.bodyId)) continue;
          const matrix = deltas.get(node.bodyId)!.clone().multiply(rest.restWorld.get(node.id)!);
          if (node.parentId) {
            const parent = data.nodes.find((n) => n.id === node.parentId)!;
            const p = rest.restWorld.get(parent.id)!.clone();
            if (parent.bodyId && deltas.has(parent.bodyId))
              p.premultiply(deltas.get(parent.bodyId)!);
            matrix.premultiply(p.invert());
          }
          const keys = tracks.get(node.id) ?? [];
          keys.push({
            id: `${node.id}:${i}`,
            time: t * m.duration,
            pose: matrixPose(matrix),
            interpolation: 'linear',
          });
          tracks.set(node.id, keys);
        }
      }
      return {
        id: `${m.id}:${closing ? 'close' : 'open'}`,
        name: `${m.name}__${m.id}__${closing ? 'close' : 'open'}`,
        duration: m.duration,
        loop: false,
        markers: [],
        tracks: [...tracks].map(([nodeId, keys]) => ({ nodeId, keys })),
      };
    }),
  );
}
/** Every part gets one stable node. A parent track and a child track compose normally. */
export function attachAnimation(
  root: Group,
  bodies: Body[],
  data: AnimationData,
  groups: BodyGroup[] = [],
  motions: Motion[] = [],
) {
  const included = new Set(bodies.map((b) => b.id));
  for (const clip of data.clips)
    for (const track of clip.tracks) {
      const ids = nodeBodyIds(data, track.nodeId);
      if (ids.some((id) => included.has(id)) && ids.some((id) => !included.has(id)))
        throw new Error(
          'Vientivalinta katkaisee animoidun ryhmän. Vie koko ryhmä tai poista animaatiot viennistä.',
        );
    }
  const selected = pruneAnimation(data, bodies, groups)!;
  const objects = new Map(root.children.map((o) => [String(o.userData.nivoId), o]));
  const rest = evaluateAnimation(selected, undefined, 0),
    nodes = new Map<string, Group>();
  for (const n of selected.nodes) {
    const node = new Group();
    node.name = animationNodeName(n, { bodies, groups });
    node.position.fromArray(n.rest.position);
    node.quaternion.fromArray(n.rest.rotation);
    node.scale.fromArray(n.rest.scale);
    node.userData.nivoAnimationNode = {
      version: 1,
      id: n.id,
      bodyId: n.bodyId,
      groupId: n.groupId,
      parentId: n.parentId,
      rest: n.rest,
    };
    nodes.set(n.id, node);
  }
  for (const n of selected.nodes) {
    const node = nodes.get(n.id)!;
    (n.parentId ? nodes.get(n.parentId)! : root).add(node);
    const object = n.bodyId && objects.get(n.bodyId);
    if (object) {
      object.matrix.premultiply(rest.restWorld.get(n.id)!.clone().invert());
      object.matrix.decompose(object.position, object.quaternion, object.scale);
      node.add(object);
    }
  }
  const clips: ThreeClip[] = [];
  const metadata: unknown[] = [];
  for (const clip of [...selected.clips, ...legacyClips(selected, bodies, motions)]) {
    const tracks: (VectorKeyframeTrack | QuaternionKeyframeTrack)[] = [];
    let jumpTolerance = 0;
    for (const track of clip.tracks) {
      const node = nodes.get(track.nodeId);
      if (!node || !track.keys.length) continue;
      const restPose = selected.nodes.find((n) => n.id === track.nodeId)!.rest;
      const samples = sampledAnimationKeys(track.keys, restPose, clip.duration);
      jumpTolerance = Math.max(jumpTolerance, samples.jumpTolerance);
      tracks.push(
        new VectorKeyframeTrack(
          `${node.uuid}.position`,
          samples.times,
          samples.poses.flatMap((p) => p.position),
          samples.step ? InterpolateDiscrete : undefined,
        ),
        new QuaternionKeyframeTrack(
          `${node.uuid}.quaternion`,
          samples.times,
          samples.poses.flatMap((p) => p.rotation),
          samples.step ? InterpolateDiscrete : undefined,
        ),
        new VectorKeyframeTrack(
          `${node.uuid}.scale`,
          samples.times,
          samples.poses.flatMap((p) => p.scale),
          samples.step ? InterpolateDiscrete : undefined,
        ),
      );
    }
    if (tracks.length) clips.push(new ThreeClip(clip.name, clip.duration, tracks));
    metadata.push({
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      loop: clip.loop,
      markers: clip.markers,
      stepTransitionToleranceSeconds: jumpTolerance,
    });
  }
  root.userData.nivoAnimation = {
    version: 1,
    coordinateSystem: 'Nivo root local: millimetres, Z up; root converts to glTF metres, Y up',
    clips: metadata,
    nodes: selected.nodes.map((n) => ({
      id: n.id,
      bodyId: n.bodyId,
      groupId: n.groupId,
      parentId: n.parentId,
    })),
  };
  return clips;
}
