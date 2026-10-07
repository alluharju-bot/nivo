import { bodyLocked } from './groups';
import type { Body, BodyGroup } from './project';

export type ColorPreview = { ids: string[]; color: string };

/** Match shared material edits without mutating the project or tessellating geometry. */
export function colorPreviewTargets(bodies: Body[], groups: BodyGroup[], ids: string[]) {
  const selected = new Set(ids);
  const families = new Set(
    bodies
      .filter((b) => selected.has(b.id) && !b.localMaterial && b.component)
      .map((b) => b.component!.id),
  );
  const targets = bodies.filter(
    (b) => selected.has(b.id) || (!b.localMaterial && b.component && families.has(b.component.id)),
  );
  // The corresponding commit would be rejected too; never preview a partial family edit.
  if (targets.some((b) => bodyLocked(b, groups))) return [];
  return targets.map((b) => b.id);
}
