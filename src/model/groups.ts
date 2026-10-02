import { uid, type Anchor, type Body, type BodyGroup, type Project, type Vec3 } from './project';
import { add } from './geometry';

export function groupAncestors(groups: BodyGroup[], id?: string): BodyGroup[] {
  const found: BodyGroup[] = [],
    seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const group = groups.find((g) => g.id === id);
    if (!group) break;
    found.push(group);
    id = group.parentId;
  }
  return found;
}
export const groupContains = (groups: BodyGroup[], parent: string, child?: string) =>
  groupAncestors(groups, child).some((g) => g.id === parent);
export const groupBodies = (project: Pick<Project, 'bodies' | 'groups'>, id: string) =>
  project.bodies.filter((b) => groupContains(project.groups, id, b.groupId));
export const bodyLocked = (body: Body, groups: BodyGroup[]) =>
  body.locked || groupAncestors(groups, body.groupId).some((g) => g.locked);
export const groupPath = (groups: BodyGroup[], id?: string) =>
  groupAncestors(groups, id)
    .reverse()
    .map((g) => g.name)
    .join(' / ');

export type TreeMove = { kind: 'bodies'; ids: string[] } | { kind: 'group'; id: string };

/** Change only hierarchy. Keep world positions, geometry and references intact. */
export function moveInTree(project: Project, move: TreeMove, parentId?: string): Project {
  if (parentId && !project.groups.some((g) => g.id === parentId))
    throw new Error('Kohderyhmää ei löydy.');
  if (move.kind === 'group') {
    const group = project.groups.find((g) => g.id === move.id);
    if (!group) throw new Error('Ryhmää ei löydy.');
    if (group.parentId === parentId) return project;
    return reparentGroup(project, move.id, parentId);
  }
  const ids = new Set(move.ids);
  if (!ids.size || [...ids].some((id) => !project.bodies.some((b) => b.id === id)))
    throw new Error('Siirrettäviä kappaleita ei löydy.');
  if (!project.bodies.some((b) => ids.has(b.id) && b.groupId !== parentId)) return project;
  return {
    ...project,
    bodies: project.bodies.map((b) => (ids.has(b.id) ? { ...b, groupId: parentId } : b)),
  };
}

export function reparentGroup(project: Project, id: string, parentId?: string): Project {
  if (!project.groups.some((g) => g.id === id)) throw new Error('Ryhmää ei löydy.');
  if (
    parentId &&
    (!project.groups.some((g) => g.id === parentId) || groupContains(project.groups, id, parentId))
  )
    throw new Error('Ryhmää ei voi siirtää itsensä tai oman alaryhmänsä sisään.');
  return { ...project, groups: project.groups.map((g) => (g.id === id ? { ...g, parentId } : g)) };
}
export function dissolveGroup(project: Project, id: string): Project {
  const parentId = project.groups.find((g) => g.id === id)?.parentId;
  return {
    ...project,
    groups: project.groups
      .filter((g) => g.id !== id)
      .map((g) => (g.parentId === id ? { ...g, parentId } : g)),
    bodies: project.bodies.map((b) => (b.groupId === id ? { ...b, groupId: parentId } : b)),
  };
}
/** One transaction moves every chosen part or clones the chosen group hierarchy. */
export function translateSelection(
  project: Project,
  ids: string[],
  offset: Vec3,
  copy = false,
  rootGroupId?: string,
) {
  const chosen = project.bodies.filter((b) => ids.includes(b.id));
  if (!chosen.length) throw new Error('Valitse ensin siirrettävät osat.');
  if (chosen.some((b) => bodyLocked(b, project.groups)))
    throw new Error(
      'Valinnassa on kiinnitetty osa tai ryhmä. Vapauta Hold ennen siirtoa tai kopiointia.',
    );
  if (!copy)
    return {
      project: {
        ...project,
        bodies: project.bodies.map((b) =>
          ids.includes(b.id) ? { ...b, origin: add(b.origin, offset) } : b,
        ),
      },
      ids,
      groupId: rootGroupId,
    };
  const bodyIds = new Map(chosen.map((b) => [b.id, uid()]));
  const copiedGroups = rootGroupId
    ? project.groups.filter(
        (g) =>
          groupContains(project.groups, rootGroupId, g.id) &&
          chosen.some((b) => groupContains(project.groups, g.id, b.groupId)),
      )
    : [];
  const groupIds = new Map(copiedGroups.map((g) => [g.id, uid()]));
  const bodies = chosen.map((b) => ({
    ...b,
    id: bodyIds.get(b.id)!,
    name: `${b.name.slice(0, 110)} kopio`,
    origin: add(b.origin, offset),
    groupId: b.groupId ? (groupIds.get(b.groupId) ?? b.groupId) : undefined,
  }));
  const groups = copiedGroups.map((g) => ({
    ...g,
    id: groupIds.get(g.id)!,
    name: g.id === rootGroupId ? `${g.name.slice(0, 110)} kopio` : g.name,
    parentId: g.parentId ? (groupIds.get(g.parentId) ?? g.parentId) : undefined,
  }));
  const anchorIds = (a: Anchor): string[] =>
    'point' in a ? [] : 'edge' in a ? [a.edge.from.bodyId, a.edge.to.bodyId] : [a.bodyId];
  const remap = (a: Anchor): Anchor =>
    'point' in a
      ? { point: add(a.point, offset) }
      : 'edge' in a
        ? {
            edge: {
              ...a.edge,
              from: { ...a.edge.from, bodyId: bodyIds.get(a.edge.from.bodyId)! },
              to: { ...a.edge.to, bodyId: bodyIds.get(a.edge.to.bodyId)! },
            },
          }
        : { ...a, bodyId: bodyIds.get(a.bodyId)! };
  const guides = project.guides
    .filter((g) => {
      const anchors = [...anchorIds(g.anchor), ...(g.endAnchor ? anchorIds(g.endAnchor) : [])];
      return anchors.length > 0 && anchors.every((id) => bodyIds.has(id));
    })
    .map((g) => ({
      ...g,
      id: uid(),
      anchor: remap(g.anchor),
      endAnchor: g.endAnchor ? remap(g.endAnchor) : undefined,
    }));
  const dimensions = project.dimensions
    .filter((d) => bodyIds.has(d.bodyId))
    .map((d) => ({ ...d, id: uid(), bodyId: bodyIds.get(d.bodyId)! }));
  return {
    project: {
      ...project,
      bodies: [...project.bodies, ...bodies],
      groups: [...project.groups, ...groups],
      guides: [...project.guides, ...guides],
      dimensions: [...project.dimensions, ...dimensions],
    },
    ids: bodies.map((b) => b.id),
    groupId: rootGroupId ? groupIds.get(rootGroupId) : undefined,
  };
}
