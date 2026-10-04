import { z } from 'zod';
import { uid } from './project';

const id = z.string().min(1).max(100);
export const selectionContextSchema = z.object({
  ids: z.array(id).max(10000),
  primary: id.optional(),
  groupId: id.optional(),
  editingBodyId: id.optional(),
  openedAssembly: id.optional(),
});
export type SelectionContext = z.infer<typeof selectionContextSchema>;
export const actionInfoSchema = z.object({
  label: z.string().min(1).max(500),
  context: selectionContextSchema.optional(),
});
export type ActionInfo = z.infer<typeof actionInfoSchema>;
const activitySchema = actionInfoSchema.extend({
  id,
  at: z.number().finite(),
  kind: z.enum(['selection', 'edit', 'undo', 'redo']),
});
export type Activity = z.infer<typeof activitySchema>;
export function sameSelection(a?: SelectionContext, b?: SelectionContext) {
  if (
    !a ||
    !b ||
    a.ids.length !== b.ids.length ||
    a.groupId !== b.groupId ||
    a.editingBodyId !== b.editingBodyId ||
    a.openedAssembly !== b.openedAssembly
  )
    return false;
  const ids = new Set(a.ids);
  return b.ids.every((id) => ids.has(id));
}

/** This journal retains only labels and selection IDs, never CAD snapshots. */
export class ActivityJournal {
  entries: Activity[] = [];
  constructor(
    public projectId: string,
    saved?: string,
    private budget = 2 * 1024 * 1024,
  ) {
    if (!saved || saved.length * 2 > budget) return;
    try {
      const data = z
        .object({ projectId: id, entries: z.array(activitySchema).max(100) })
        .parse(JSON.parse(saved));
      if (data.projectId === projectId) this.entries = data.entries;
    } catch {
      /* A damaged optional journal must never prevent modelling. */
    }
  }
  record(info: ActionInfo, kind: Activity['kind']) {
    if (
      kind === 'selection' &&
      (!info.context?.ids.length || sameSelection(this.entries[0]?.context, info.context))
    )
      return;
    if (
      kind === 'edit' &&
      this.entries[0]?.kind === 'selection' &&
      sameSelection(this.entries[0].context, info.context)
    )
      this.entries.shift();
    this.entries.unshift({
      label: info.label.slice(0, 500),
      context: info.context && { ...info.context, ids: [...info.context.ids] },
      id: uid(),
      at: Date.now(),
      kind,
    });
    this.entries = this.entries.slice(0, 100);
    while (this.entries.length && this.serialize().length * 2 > this.budget) this.entries.pop();
  }
  serialize() {
    return JSON.stringify({ projectId: this.projectId, entries: this.entries });
  }
}
