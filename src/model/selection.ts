import { isOverallDimension, type Project } from './project';
import { bodyLocked, groupAncestors, groupBodies, groupContains } from './groups';
import { anchorBodyId, dimensionBodyIds } from './dimensions';

/** The outermost closed assembly acts as one selectable unit. Folders never do. */
export function selectionUnit(project: Project, id: string, opened?: string) {
  const body = project.bodies.find((b) => b.id === id);
  if (!body) return { ids: [] as string[] };
  const path = groupAncestors(project.groups, body.groupId).reverse();
  const candidates = opened ? path.slice(path.findIndex((g) => g.id === opened) + 1) : path;
  const assembly = candidates.find((g) => g.kind === 'assembly');
  return assembly
    ? { ids: groupBodies(project, assembly.id).map((b) => b.id), groupId: assembly.id }
    : { ids: [id] };
}
export function inAssembly(project: Project, id: string, opened?: string) {
  return (
    !opened ||
    groupContains(project.groups, opened, project.bodies.find((b) => b.id === id)?.groupId)
  );
}
export function removeSelection(project: Project, ids: string[]) {
  const chosen = new Set(ids);
  const bodies = project.bodies.filter((b) => chosen.has(b.id));
  if (!bodies.length) return project;
  if (bodies.some((b) => bodyLocked(b, project.groups)))
    throw new Error('Valinnassa on Hold-kiinnitettyjä osia. Vapauta ne ennen poistamista.');
  const parts = project.settings.cutting?.parts;
  return {
    ...project,
    bodies: project.bodies.filter((b) => !chosen.has(b.id)),
    dimensions: project.dimensions.filter(
      (d) => isOverallDimension(d) || !dimensionBodyIds(d, project).some((id) => chosen.has(id)),
    ),
    guides: project.guides.filter(
      (g) => ![g.anchor, g.endAnchor].some((a) => a && chosen.has(anchorBodyId(a) ?? '')),
    ),
    settings: parts
      ? {
          ...project.settings,
          cutting: {
            ...project.settings.cutting!,
            parts: Object.fromEntries(Object.entries(parts).filter(([id]) => !chosen.has(id))),
          },
        }
      : project.settings,
  };
}
