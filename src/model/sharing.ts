import type { Project } from './project';

/** Validation produces fresh objects. Restore immutable references so history and
 * viewport caches do not retain another copy of every unchanged CAD feature. */
export function shareProjectData(previous: Project, next: Project): Project {
  if (previous.id !== next.id) return next;
  const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const reuse = <T extends { id: string }>(old: T[], items: T[]) => {
    const byId = new Map(old.map((item) => [item.id, item]));
    const shared = items.map((item) => {
      const existing = byId.get(item.id);
      return existing && equal(existing, item) ? existing : item;
    });
    return old.length === shared.length && old.every((item, i) => item === shared[i])
      ? old
      : shared;
  };
  const oldBodies = new Map(previous.bodies.map((b) => [b.id, b]));
  const bodies = reuse(
    previous.bodies,
    next.bodies.map((body) => {
      const before = oldBodies.get(body.id);
      return before && equal(before.feature, body.feature)
        ? { ...body, feature: before.feature }
        : body;
    }),
  );
  return {
    ...next,
    bodies,
    groups: reuse(previous.groups, next.groups),
    dimensions: reuse(previous.dimensions, next.dimensions),
    guides: reuse(previous.guides, next.guides),
    annotations: next.annotations ? reuse(previous.annotations ?? [], next.annotations) : undefined,
    assets: equal(previous.assets, next.assets) ? previous.assets : next.assets,
    sections: next.sections ? reuse(previous.sections ?? [], next.sections) : undefined,
    referenceImages: next.referenceImages
      ? reuse(previous.referenceImages ?? [], next.referenceImages)
      : undefined,
  };
}
