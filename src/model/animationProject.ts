import { Matrix4 } from 'three';
import {
  ensureAnimationNodes,
  evaluateAnimation,
  matrixPose,
  nodeBodyIds,
  poseMatrix,
  type AnimationData,
} from './animation';
import { uid, type Project, type Vec3 } from './project';

/** Keep model and animation parenting in agreement without silently changing inherited motion. */
export function reconcileAnimationHierarchy(before: Project, project: Project): Project {
  if (!project.animation) return project;
  const oldBodies = new Map(before.bodies.map((b) => [b.id, b.groupId]));
  const oldGroups = new Map(before.groups.map((g) => [g.id, g.parentId]));
  if (
    project.bodies.length === before.bodies.length &&
    project.groups.length === before.groups.length &&
    project.bodies.every((b) => oldBodies.has(b.id) && oldBodies.get(b.id) === b.groupId) &&
    project.groups.every((g) => oldGroups.has(g.id) && oldGroups.get(g.id) === g.parentId)
  )
    return project;
  const data = ensureAnimationNodes(project),
    world = evaluateAnimation(data, undefined, 0).restWorld;
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const groupNodes = new Map(data.nodes.filter((n) => n.groupId).map((n) => [n.groupId!, n.id]));
  const bodies = new Map(project.bodies.map((b) => [b.id, b]));
  const groups = new Map(project.groups.map((g) => [g.id, g]));
  const animated = new Set(
    data.clips.flatMap((c) => c.tracks.filter((t) => t.keys.length > 0).map((t) => t.nodeId)),
  );
  const inheritsMotion = (id: string | undefined) => {
    while (id) {
      if (animated.has(id)) return true;
      id = nodes.get(id)?.parentId;
    }
    return false;
  };
  const changes = new Map<string, { parentId?: string; matrix: Matrix4 }>();
  for (const n of data.nodes) {
    const target = n.bodyId ? bodies.get(n.bodyId) : n.groupId ? groups.get(n.groupId) : undefined;
    if (!target) continue;
    const parentGroup = n.bodyId ? bodies.get(n.bodyId)?.groupId : groups.get(n.groupId!)?.parentId;
    const parentId = parentGroup ? groupNodes.get(parentGroup) : undefined;
    if (parentId === n.parentId) continue;
    if (inheritsMotion(n.parentId) || inheritsMotion(parentId))
      throw new Error(
        'Ryhmän vaihto muuttaisi osan perimää animaatiota. Säilytä animoitu kokonaisuus tai poista sen ryhmäraidat ennen uudelleenryhmittelyä.',
      );
    const previous = n.parentId ? world.get(n.parentId)! : new Matrix4();
    const next = parentId ? world.get(parentId)! : new Matrix4();
    changes.set(n.id, { parentId, matrix: next.clone().invert().multiply(previous) });
  }
  const convert = (id: string, pose: import('./animation').Pose) =>
    changes.has(id) ? matrixPose(poseMatrix(pose).premultiply(changes.get(id)!.matrix)) : pose;
  return {
    ...project,
    animation: {
      ...data,
      nodes: data.nodes.map((n) =>
        changes.has(n.id)
          ? { ...n, parentId: changes.get(n.id)!.parentId, rest: convert(n.id, n.rest) }
          : n,
      ),
      clips: data.clips.map((c) => ({
        ...c,
        tracks: c.tracks.map((t) =>
          changes.has(t.nodeId)
            ? { ...t, keys: t.keys.map((k) => ({ ...k, pose: convert(t.nodeId, k.pose) })) }
            : t,
        ),
      })),
    },
  };
}

/** Moving the rest model carries its pivots and authored poses, not just its mesh. */
export function transformAnimationModel(
  data: AnimationData | undefined,
  bodyIds: string[],
  delta: Matrix4,
) {
  if (!data) return data;
  const chosen = new Set(bodyIds),
    eligible = new Set(
      data.nodes
        .filter((n) => {
          const ids = nodeBodyIds(data, n.id);
          return ids.length && ids.every((id) => chosen.has(id));
        })
        .map((n) => n.id),
    );
  const roots = data.nodes.filter(
    (n) => eligible.has(n.id) && (!n.parentId || !eligible.has(n.parentId)),
  );
  const { restWorld } = evaluateAnimation(data, undefined, 0);
  const changes = new Map(
    roots.map((n) => {
      const parent = n.parentId ? restWorld.get(n.parentId)! : new Matrix4();
      return [n.id, parent.clone().invert().multiply(delta).multiply(parent)] as const;
    }),
  );
  return {
    ...data,
    nodes: data.nodes.map((n) =>
      changes.has(n.id)
        ? { ...n, rest: matrixPose(poseMatrix(n.rest).premultiply(changes.get(n.id)!)) }
        : n,
    ),
    clips: data.clips.map((c) => ({
      ...c,
      tracks: c.tracks.map((t) =>
        changes.has(t.nodeId)
          ? {
              ...t,
              keys: t.keys.map((k) => ({
                ...k,
                pose: matrixPose(poseMatrix(k.pose).premultiply(changes.get(t.nodeId)!)),
              })),
            }
          : t,
      ),
    })),
  };
}
export function copyAnimation(
  data: AnimationData | undefined,
  bodies: Map<string, string>,
  groups: Map<string, string>,
  offset: Vec3,
) {
  if (!data) return data;
  const chosen = data.nodes.filter(
    (n) => (n.bodyId && bodies.has(n.bodyId)) || (n.groupId && groups.has(n.groupId)),
  );
  const ids = new Map(chosen.map((n) => [n.id, uid()]));
  const { restWorld } = evaluateAnimation(data, undefined, 0);
  const changes = new Map(
    chosen
      .filter((n) => !n.parentId || !ids.has(n.parentId))
      .map((n) => {
        const parent = n.parentId ? restWorld.get(n.parentId)! : new Matrix4();
        return [
          n.id,
          parent
            .clone()
            .invert()
            .multiply(new Matrix4().makeTranslation(...offset))
            .multiply(parent),
        ] as const;
      }),
  );
  return {
    ...data,
    nodes: [
      ...data.nodes,
      ...chosen.map((n) => ({
        ...n,
        id: ids.get(n.id)!,
        bodyId: n.bodyId ? bodies.get(n.bodyId) : undefined,
        groupId: n.groupId ? groups.get(n.groupId) : undefined,
        parentId: n.parentId ? (ids.get(n.parentId) ?? n.parentId) : undefined,
        rest: changes.has(n.id)
          ? matrixPose(poseMatrix(n.rest).premultiply(changes.get(n.id)!))
          : n.rest,
      })),
    ],
    clips: data.clips.map((c) => ({
      ...c,
      tracks: [
        ...c.tracks,
        ...c.tracks
          .filter((t) => ids.has(t.nodeId))
          .map((t) => ({
            nodeId: ids.get(t.nodeId)!,
            keys: t.keys.map((k) => ({
              ...k,
              id: uid(),
              pose: changes.has(t.nodeId)
                ? matrixPose(poseMatrix(k.pose).premultiply(changes.get(t.nodeId)!))
                : k.pose,
            })),
          })),
      ],
    })),
  };
}
