import type { Anchor, Body, Project } from './project';
export type BooleanOperation = 'cut' | 'join';
export function applyBoolean(
  project: Project,
  targets: string[],
  tools: string[],
  results: Body[],
  operation: BooleanOperation,
  keepTools: boolean,
): Project {
  const removed = new Set([...targets, ...(keepTools ? [] : tools)]),
    first = results[0];
  const remap = (anchor: Anchor): Anchor => {
    if ('point' in anchor) return anchor;
    if ('edge' in anchor)
      return {
        edge: {
          ...anchor.edge,
          from: remap(anchor.edge.from) as typeof anchor.edge.from,
          to: remap(anchor.edge.to) as typeof anchor.edge.to,
        },
      };
    if (operation === 'join' && first && anchor.bodyId !== first.id && removed.has(anchor.bodyId)) {
      const key = `${anchor.bodyId}:${anchor.key}`,
        local = first.vertexRefs?.[key];
      if (local) return { bodyId: first.id, key, local };
    }
    return anchor;
  };
  return {
    ...project,
    bodies: [...project.bodies.filter((b) => !removed.has(b.id)), ...results],
    guides: project.guides.map((g) => ({
      ...g,
      anchor: remap(g.anchor),
      endAnchor: g.endAnchor ? remap(g.endAnchor) : undefined,
    })),
  };
}
