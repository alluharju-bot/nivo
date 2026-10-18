import type { Project } from './project';

/** Compare validated JSON data without allocating serialized copies of BReps.
 * Optional undefined properties are equivalent to absent JSON properties. */
export function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equalJson(v, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  return (
    keys.length === Object.keys(right).filter((k) => right[k] !== undefined).length &&
    keys.every((k) => Object.hasOwn(right, k) && equalJson(left[k], right[k]))
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
      return existing && equalJson(existing, item) ? existing : item;
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
      return before && equalJson(before.feature, body.feature)
        ? { ...body, feature: before.feature }
        : body;
    }),
  );
  return {
    ...next,
    bodies,
    motions: next.motions ? reuse(previous.motions ?? [], next.motions) : undefined,
    groups: reuse(previous.groups, next.groups),
    partTypes: next.partTypes ? reuse(previous.partTypes ?? [], next.partTypes) : undefined,
    dimensions: reuse(previous.dimensions, next.dimensions),
    drawingAnnotations: next.drawingAnnotations
      ? reuse(previous.drawingAnnotations ?? [], next.drawingAnnotations)
      : undefined,
    drawingSheets: next.drawingSheets
      ? reuse(previous.drawingSheets ?? [], next.drawingSheets)
      : undefined,
    guides: reuse(previous.guides, next.guides),
    distributions: next.distributions
      ? reuse(previous.distributions ?? [], next.distributions)
      : undefined,
    annotations: next.annotations ? reuse(previous.annotations ?? [], next.annotations) : undefined,
    assets: equalJson(previous.assets, next.assets) ? previous.assets : next.assets,
    sections: next.sections ? reuse(previous.sections ?? [], next.sections) : undefined,
    referenceImages: next.referenceImages
      ? reuse(previous.referenceImages ?? [], next.referenceImages)
      : undefined,
  };
}
