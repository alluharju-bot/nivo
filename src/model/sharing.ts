import type { Project } from './project';

/** Compare validated JSON data without allocating serialized copies of BReps.
 * Optional undefined properties are equivalent to absent JSON properties. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  return (
    keys.length === Object.keys(right).filter((k) => right[k] !== undefined).length &&
    keys.every((k) => Object.hasOwn(right, k) && equal(left[k], right[k]))
  );
}

/** Validation produces fresh objects. Restore immutable references so history and
 * viewport caches do not retain another copy of every unchanged CAD feature. */
export function shareProjectData(previous: Project, next: Project): Project {
  if (previous.id !== next.id) return next;
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
