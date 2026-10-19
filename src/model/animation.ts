import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Body, BodyGroup, Project, Vec3 } from './project';
import { bounds, uid } from './project';

import {
  poseSchema,
  type AnimationData,
  type AnimationNode,
  type AnimationClip,
  type AnimationKey,
  type Pose,
  type PoseMap,
} from './animationSchema';
export * from './animationSchema';
export const restPose = (position: Vec3 = [0, 0, 0]): Pose => ({
  position,
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
export const poseMatrix = (pose: Pose) =>
  new Matrix4().compose(
    new Vector3(...pose.position),
    new Quaternion(...pose.rotation),
    new Vector3(...pose.scale),
  );
export function matrixPose(matrix: Matrix4): Pose {
  const p = new Vector3(),
    q = new Quaternion(),
    s = new Vector3();
  matrix.decompose(p, q, s);
  const pose = poseSchema.parse({
    position: p.toArray(),
    rotation: q.normalize().toArray(),
    scale: s.toArray(),
  });
  const rebuilt = poseMatrix(pose);
  if (
    matrix.elements.some(
      (n, i) => Math.abs(n - rebuilt.elements[i]) > 1e-6 * Math.max(1, Math.abs(n)),
    )
  )
    throw new Error(
      'Tämä muunnos vinouttaisi paikallista akselistoa. Käytä paikallisia skaala-arvoja tai tasaista skaalausta.',
    );
  return pose;
}
export function interpolatePose(a: Pose, b: Pose, t: number): Pose {
  return {
    position: a.position.map((v, i) => v + (b.position[i] - v) * t) as Vec3,
    rotation: new Quaternion(...a.rotation)
      .slerp(new Quaternion(...b.rotation), t)
      .normalize()
      .toArray(),
    scale: a.scale.map((v, i) => v + (b.scale[i] - v) * t) as Vec3,
  };
}
export function evaluateTrack(keys: AnimationKey[], time: number, rest: Pose): Pose {
  if (!keys.length) return rest;
  if (time <= keys[0].time) return keys[0].pose;
  if (time >= keys.at(-1)!.time) return keys.at(-1)!.pose;
  let lo = 0,
    hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const a = keys[lo],
    b = keys[hi];
  if (a.interpolation === 'step') return a.pose;
  let t = (time - a.time) / (b.time - a.time);
  if (a.interpolation === 'smooth') t = t * t * (3 - 2 * t);
  return interpolatePose(a.pose, b.pose, t);
}
export function evaluateAnimation(
  data: AnimationData,
  clip: AnimationClip | undefined,
  time: number,
  drafts: PoseMap = {},
) {
  const local = new Map<string, Pose>(),
    world = new Map<string, Matrix4>(),
    restWorld = new Map<string, Matrix4>(),
    bodyMatrices = new Map<string, Matrix4>();
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const tracks = new Map(clip?.tracks.map((t) => [t.nodeId, t.keys]));
  for (const n of data.nodes)
    local.set(n.id, drafts[n.id] ?? evaluateTrack(tracks.get(n.id) ?? [], time, n.rest));
  const resolve = (node: AnimationNode) => {
    if (world.has(node.id)) return;
    const parent = node.parentId && nodes.get(node.parentId);
    if (parent) resolve(parent);
    const m = poseMatrix(local.get(node.id)!),
      r = poseMatrix(node.rest);
    if (parent) {
      m.premultiply(world.get(parent.id)!);
      r.premultiply(restWorld.get(parent.id)!);
    }
    world.set(node.id, m);
    restWorld.set(node.id, r);
    if (node.bodyId) bodyMatrices.set(node.bodyId, m.clone().multiply(r.clone().invert()));
  };
  data.nodes.forEach(resolve);
  return { local, world, restWorld, bodyMatrices };
}
/** Snapshot the model hierarchy in independent animation frames. IDs survive renaming. */
export function ensureAnimationNodes(
  project: Pick<Project, 'bodies' | 'groups' | 'animation'>,
): AnimationData {
  const data: AnimationData = project.animation ?? { version: 1, nodes: [], clips: [] };
  const nodes = [...data.nodes],
    groups = new Map(nodes.filter((n) => n.groupId).map((n) => [n.groupId!, n])),
    bodies = new Set(nodes.map((n) => n.bodyId));
  const world = evaluateAnimation(data, undefined, 0).restWorld;
  const addGroup = (group: BodyGroup): AnimationNode => {
    const existing = groups.get(group.id);
    if (existing) return existing;
    const parentGroup = project.groups.find((g) => g.id === group.parentId);
    const parent = parentGroup && addGroup(parentGroup);
    const members = project.bodies.filter((b) => {
      let id = b.groupId;
      while (id) {
        if (id === group.id) return true;
        id = project.groups.find((g) => g.id === id)?.parentId;
      }
      return false;
    });
    const box = members.length ? bounds(members) : { min: [0, 0, 0], max: [0, 0, 0] };
    const center = box.min.map((v, i) => (v + box.max[i]) / 2) as Vec3,
      frame = new Matrix4().makeTranslation(...center);
    const node: AnimationNode = {
      id: uid(),
      name: group.name,
      groupId: group.id,
      parentId: parent?.id,
      rest: matrixPose(
        parent ? frame.clone().premultiply(world.get(parent.id)!.clone().invert()) : frame,
      ),
    };
    nodes.push(node);
    groups.set(group.id, node);
    world.set(node.id, frame);
    return node;
  };
  project.groups.forEach(addGroup);
  for (const b of project.bodies)
    if (!bodies.has(b.id)) {
      const box = bounds([b]),
        center = box.min.map((v, i) => (v + box.max[i]) / 2) as Vec3;
      const parent = b.groupId && groups.get(b.groupId);
      const rest = new Matrix4().makeTranslation(...center);
      if (parent) rest.premultiply(world.get(parent.id)!.clone().invert());
      nodes.push({
        id: uid(),
        bodyId: b.id,
        name: b.name,
        parentId: parent ? parent.id : undefined,
        rest: matrixPose(rest),
      });
    }
  return { ...data, nodes };
}
export function animationNodeName(
  node: AnimationNode,
  project: Pick<Project, 'bodies' | 'groups'>,
) {
  return (
    project.bodies.find((b) => b.id === node.bodyId)?.name ??
    project.groups.find((g) => g.id === node.groupId)?.name ??
    node.name
  );
}
export function nodeBodyIds(data: AnimationData, nodeId: string): string[] {
  const children = new Map<string, AnimationNode[]>();
  for (const n of data.nodes)
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const ids: string[] = [];
  const walk = (n: AnimationNode) => {
    if (n.bodyId) ids.push(n.bodyId);
    children.get(n.id)?.forEach(walk);
  };
  const node = data.nodes.find((n) => n.id === nodeId);
  if (node) walk(node);
  return ids;
}
export function putKey(clip: AnimationClip, nodeId: string, key: AnimationKey): AnimationClip {
  const track = clip.tracks.find((t) => t.nodeId === nodeId);
  const same = track?.keys.find((k) => Math.abs(k.time - key.time) < 1e-6);
  const keys = [
    ...(track?.keys ?? []).filter((k) => k.id !== key.id && k.id !== same?.id),
    { ...key, id: same?.id ?? key.id },
  ].sort((a, b) => a.time - b.time);
  return {
    ...clip,
    tracks: track
      ? clip.tracks.map((t) => (t.nodeId === nodeId ? { nodeId, keys } : t))
      : [...clip.tracks, { nodeId, keys }],
  };
}
export function transformAnimationNodes(
  data: AnimationData,
  clip: AnimationClip,
  time: number,
  drafts: PoseMap,
  ids: string[],
  delta: Matrix4,
): PoseMap {
  const selected = new Set(ids),
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const evaluation = evaluateAnimation(data, clip, time, drafts),
    result = { ...drafts };
  for (const id of ids) {
    const node = nodes.get(id);
    if (!node) continue;
    let parent = node.parentId,
      inherited = false;
    while (parent) {
      if (selected.has(parent)) inherited = true;
      parent = nodes.get(parent)?.parentId;
    }
    if (inherited) continue;
    const local = delta.clone().multiply(evaluation.world.get(id)!);
    if (node.parentId) local.premultiply(evaluation.world.get(node.parentId)!.clone().invert());
    result[id] = matrixPose(local);
  }
  return result;
}
/** Rebase a pivot without moving existing poses or any descendants. */
export function rebaseAnimationPivot(
  data: AnimationData,
  nodeId: string,
  point: Vec3,
): AnimationData {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) return data;
  const { restWorld } = evaluateAnimation(data, undefined, 0);
  const offset = new Vector3(...point).applyMatrix4(restWorld.get(nodeId)!.clone().invert());
  const c = new Matrix4().makeTranslation(...offset.toArray()),
    inverse = c.clone().invert();
  const change = (id: string, pose: Pose) =>
    id === nodeId
      ? matrixPose(poseMatrix(pose).multiply(c))
      : data.nodes.find((n) => n.id === id)?.parentId === nodeId
        ? matrixPose(poseMatrix(pose).premultiply(inverse))
        : pose;
  return {
    ...data,
    nodes: data.nodes.map((n) => ({ ...n, rest: change(n.id, n.rest) })),
    clips: data.clips.map((clip) => ({
      ...clip,
      tracks: clip.tracks.map((t) => ({
        ...t,
        keys: t.keys.map((k) => ({ ...k, pose: change(t.nodeId, k.pose) })),
      })),
    })),
  };
}
export function pruneAnimation(
  data: AnimationData | undefined,
  bodies: Pick<Body, 'id'>[],
  groups: Pick<BodyGroup, 'id'>[],
) {
  if (!data) return data;
  const bodyIds = new Set(bodies.map((b) => b.id)),
    groupIds = new Set(groups.map((g) => g.id));
  const keep = new Set<string>();
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  for (const n of data.nodes)
    if (n.bodyId && bodyIds.has(n.bodyId)) {
      let next: AnimationNode | undefined = n;
      while (next && !keep.has(next.id)) {
        keep.add(next.id);
        next = next.parentId ? byId.get(next.parentId) : undefined;
      }
    }
  return {
    ...data,
    nodes: data.nodes
      .filter((n) => keep.has(n.id))
      .map((n) => ({
        ...n,
        bodyId: n.bodyId && bodyIds.has(n.bodyId) ? n.bodyId : undefined,
        groupId: n.groupId && groupIds.has(n.groupId) ? n.groupId : undefined,
      })),
    clips: data.clips.map((c) => ({ ...c, tracks: c.tracks.filter((t) => keep.has(t.nodeId)) })),
  };
}
export const poseDegrees = (p: Pose): Vec3 => {
  const e = new Euler().setFromQuaternion(new Quaternion(...p.rotation), 'XYZ');
  return [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as Vec3;
};
export const degreesRotation = (v: Vec3): Pose['rotation'] =>
  new Quaternion()
    .setFromEuler(new Euler(...(v.map((n) => (n * Math.PI) / 180) as Vec3), 'XYZ'))
    .normalize()
    .toArray();
/** Runtime events: seeking never fires. Loops are split into monotonic intervals by the host. */
export function crossedMarkers(clip: AnimationClip, from: number, to: number, seek = false) {
  if (seek || from === to) return [];
  return clip.markers
    .filter((m) => (to > from ? m.time > from && m.time <= to : m.time < from && m.time >= to))
    .sort((a, b) => (to > from ? a.time - b.time : b.time - a.time));
}
