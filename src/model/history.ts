import { parseProject, projectSchema, type Project } from './project';
import { equalJson, shareProjectData } from './sharing';
import { HistoryMemory } from './historyMemory';
import { HistoryGraphWriter, readHistoryGraph } from './historyGraph';
import { actionInfoSchema, type ActionInfo } from './activity';
import { hiddenItems, newlyHidden, type HiddenItems } from './visibility';

const MAX_SAVED_BYTES = 8 * 1024 * 1024;
export const MAX_HISTORY_STEPS = 100;

export class History {
  private past: Project[] = [];
  private future: Project[] = [];
  private memory = new HistoryMemory();
  private active: Project;
  memoryLimited = false;
  savedSteps = 0;
  private actions = new WeakMap<Project, ActionInfo>();
  get current() {
    return this.active;
  }
  set current(next: Project) {
    this.memory.retain(next);
    this.memory.release(this.active);
    this.active = next;
  }
  get undoCount() {
    return this.past.length;
  }
  get redoCount() {
    return this.future.length;
  }
  get retainedBytes() {
    return this.memory.bytes;
  }
  get undoInfo() {
    return this.actions.get(this.current);
  }
  get redoInfo() {
    const next = this.peekRedo();
    return next && this.actions.get(next);
  }
  /** The journal keeps only an ID; geometry stays in the bounded undo history. */
  beforeAction(actionId: string) {
    const timeline = [...this.past, this.current, ...this.future.slice().reverse()];
    const index = timeline.findIndex((p) => this.actions.get(p)?.actionId === actionId);
    if (index < 1) return;
    return { project: timeline[index - 1], info: this.actions.get(timeline[index])! };
  }
  restoreBeforeAction(actionId: string) {
    const before = this.beforeAction(actionId);
    if (!before) return;
    const timeline = [...this.past, this.current, ...this.future.slice().reverse()];
    const index = timeline.indexOf(before.project);
    this.past = timeline.slice(0, index);
    this.active = before.project;
    this.future = timeline.slice(index + 1).reverse();
    return this.current;
  }
  adopt(next: Project) {
    const info = this.actions.get(this.current);
    if (info) this.actions.set(next, info);
    this.current = next;
  }
  constructor(
    current: Project,
    private memoryBudget = 64 * 1024 * 1024,
  ) {
    this.active = current;
    this.memory.retain(current);
  }
  private clearFuture() {
    this.future.forEach((p) => this.memory.release(p));
    this.future = [];
  }
  private trimMemory() {
    while (this.memory.bytes > this.memoryBudget && (this.past.length || this.future.length)) {
      const list = this.past.length >= this.future.length ? this.past : this.future;
      this.memory.release(list.shift()!);
      this.memoryLimited = true;
    }
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next: Project, info?: ActionInfo) {
    this.memory.retain(this.current);
    this.past.push(this.current);
    if (this.past.length > MAX_HISTORY_STEPS) this.memory.release(this.past.shift()!);
    this.current = next;
    if (info) this.actions.set(next, info);
    this.clearFuture();
    this.trimMemory();
  }
  peekUndo() {
    return this.past.at(-1);
  }
  peekRedo() {
    return this.future.at(-1);
  }
  /** Latest still-hidden batch in the active undo branch; survives saved history. */
  lastHidden(): HiddenItems {
    const hidden = hiddenItems(this.current);
    if (!hidden.size) return hidden;
    let after = this.current;
    for (let i = this.past.length - 1; i >= 0; i--) {
      const before = this.past[i];
      if (before.id !== this.current.id) break;
      const batch = new Set([...newlyHidden(before, after)].filter((id) => hidden.has(id)));
      if (batch.size) return batch;
      after = before;
    }
    return new Set();
  }
  undo() {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.current);
      this.active = previous;
    }
    return this.current;
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.current);
      this.active = next;
    }
    return this.current;
  }
  /** Store shared geometry once and retain the nearest steps in both directions. */
  serialize(maxBytes = MAX_SAVED_BYTES, maxSteps = MAX_HISTORY_STEPS): string | undefined {
    this.savedSteps = 0;
    const graph = new HistoryGraphWriter(),
      encoder = new TextEncoder();
    const pack = (project: Project) =>
      graph.encode({ ...project, _history: this.actions.get(project) });
    const current = pack(this.current),
      past: unknown[] = [],
      future: unknown[] = [];
    // Reserve header and all root references. The graph's byte count includes separators.
    const limit = Math.min(MAX_HISTORY_STEPS, Math.max(0, Math.floor(maxSteps)));
    const overhead = 128 + (limit + 1) * 10;
    if (graph.bytes + overhead > maxBytes) return;
    const nextPast = this.past.slice(-limit),
      nextFuture = this.future.slice(-limit);
    let pastOpen = true,
      futureOpen = true;
    for (let step = 0; step < limit; step++) {
      const usePast =
        pastOpen &&
        nextPast.length > 0 &&
        (!futureOpen || !nextFuture.length || past.length <= future.length);
      const source = usePast ? nextPast : nextFuture,
        destination = usePast ? past : future;
      if ((usePast && !pastOpen) || (!usePast && !futureOpen) || !source.length) break;
      const checkpoint = graph.checkpoint;
      const root = pack(source.pop()!);
      if (graph.bytes + overhead > maxBytes) {
        graph.rollback(checkpoint);
        if (usePast) pastOpen = false;
        else futureOpen = false;
        step--;
      } else destination.unshift(root);
    }
    const data = `{"version":3,"nodes":${graph.json()},"current":${JSON.stringify(current)},"past":${JSON.stringify(past)},"future":${JSON.stringify(future)}}`;
    if (encoder.encode(data).length > maxBytes) return;
    this.savedSteps = past.length + future.length;
    return data;
  }

  /** A missing, damaged or stale history must never prevent opening the active model. */
  restore(serialized?: string): boolean {
    this.past.forEach((p) => this.memory.release(p));
    this.past = [];
    this.clearFuture();
    this.memoryLimited = false;
    if (!serialized || new TextEncoder().encode(serialized).length > MAX_SAVED_BYTES) return false;
    try {
      const data = JSON.parse(serialized);
      if (
        !data ||
        !Array.isArray(data.past) ||
        !Array.isArray(data.future) ||
        data.past.length + data.future.length > MAX_HISTORY_STEPS
      )
        return false;
      const shared = data.version === 3;
      if (shared) {
        const read = readHistoryGraph(data.nodes);
        data.current = read(data.current);
        data.past = data.past.map(read);
        data.future = data.future.map(read);
        data.version = 1;
      }
      if (data.version === 2) {
        const unpack = (p: any) => ({
          ...p,
          assets: Array.isArray(p.assets)
            ? Object.fromEntries(p.assets.map((id: string) => [id, data.assets[id]]))
            : undefined,
        });
        data.current = unpack(data.current);
        data.past = data.past.map(unpack);
        data.future = data.future.map(unpack);
        data.version = 1;
      }
      // v3 contains current-schema objects. Avoid serializing a multi-megabyte
      // BRep 100 times just to validate it. Legacy formats still run migrations.
      const validate = (raw: unknown) =>
        shared
          ? projectSchema.parse(
              raw && typeof raw === 'object' && 'version' in raw && raw.version === 8
                ? { ...raw, version: 9 }
                : raw,
            )
          : parseProject(JSON.stringify(raw));
      if (
        data.version !== 1 ||
        !equalJson(validate(data.current), projectSchema.parse(this.current))
      )
        return false;
      let previous = this.current;
      const restoreProject = (raw: unknown) => {
        previous = shareProjectData(previous, validate(raw));
        return previous;
      };
      // Walk outwards from current so unchanged CAD features stay shared after reload.
      const past = data.past.slice().reverse().map(restoreProject).reverse();
      previous = this.current;
      const future = data.future.slice().reverse().map(restoreProject).reverse();
      this.past = past;
      this.future = future;
      for (const p of [...past, ...future]) this.memory.retain(p);
      const restoreInfo = (project: Project, raw: any) => {
        const info = actionInfoSchema.safeParse(raw?._history);
        if (info.success) this.actions.set(project, info.data);
      };
      restoreInfo(this.current, data.current);
      past.forEach((p: Project, i: number) => restoreInfo(p, data.past[i]));
      future.forEach((p: Project, i: number) => restoreInfo(p, data.future[i]));
      this.trimMemory();
      return true;
    } catch {
      return false;
    }
  }
}
