import type { Project } from './project';
import { bodyLocked, groupAncestors } from './groups';

/** Hold protects the whole object. Visibility and explicit unlocking remain available.
 * Run after linked-component propagation too, so indirect edits cannot bypass it.
 * Undo/redo and project loading deliberately do not use this commit guard.
 */
export function assertHolds(before: Project, after: Project) {
  if (before.id !== after.id) return;
  const held = before.bodies.filter((b) => bodyLocked(b, before.groups));
  const comparable = ({
    locked: _locked,
    hidden: _hidden,
    ...value
  }: {
    locked?: boolean;
    hidden?: boolean;
  }) => JSON.stringify(value);
  if (held.length) {
    const next = new Map(after.bodies.map((b) => [b.id, b]));
    for (const body of held) {
      const updated = next.get(body.id);
      if (!updated || (body !== updated && comparable(body) !== comparable(updated)))
        throw new Error(`”${body.name}” on Hold-lukittu. Vapauta Hold ennen muokkaamista.`);
    }
  }
  for (const group of before.groups) {
    if (!groupAncestors(before.groups, group.id).some((g) => g.locked)) continue;
    const updated = after.groups.find((g) => g.id === group.id);
    if (!updated || (group !== updated && comparable(group) !== comparable(updated)))
      throw new Error(`Ryhmä ”${group.name}” on Hold-lukittu. Vapauta Hold ennen muokkaamista.`);
  }
}
