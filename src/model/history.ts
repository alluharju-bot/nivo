import { projectSchema, type Project } from './project';

const MAX_SAVED_BYTES = 8 * 1024 * 1024;
const MAX_SAVED_STEPS = 20;

export class History {
  private past: Project[] = [];
  private future: Project[] = [];
  constructor(public current: Project) {}
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next: Project) {
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.current = next;
    this.future = [];
  }
  peekUndo() {
    return this.past.at(-1);
  }
  peekRedo() {
    return this.future.at(-1);
  }
  undo() {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.current);
      this.current = previous;
    }
    return this.current;
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.current);
      this.current = next;
    }
    return this.current;
  }
  /** Store the nearest undo/redo steps within a bounded browser-storage budget. */
  serialize(maxBytes = MAX_SAVED_BYTES, maxSteps = MAX_SAVED_STEPS): string | undefined {
    const past = this.past.slice(-maxSteps),
      future = this.future.slice(-maxSteps);
    while (true) {
      const data = JSON.stringify({ version: 1, current: this.current, past, future });
      if (
        past.length + future.length <= maxSteps &&
        new TextEncoder().encode(data).length <= maxBytes
      )
        return data;
      if (!past.length && !future.length) return;
      (past.length >= future.length ? past : future).shift();
    }
  }
  /** A missing, damaged or stale history must never prevent opening the active model. */
  restore(serialized?: string): boolean {
    this.past = [];
    this.future = [];
    if (!serialized || new TextEncoder().encode(serialized).length > MAX_SAVED_BYTES) return false;
    try {
      const data = JSON.parse(serialized);
      if (
        data.version !== 1 ||
        !Array.isArray(data.past) ||
        !Array.isArray(data.future) ||
        data.past.length + data.future.length > MAX_SAVED_STEPS ||
        JSON.stringify(data.current) !== JSON.stringify(this.current)
      )
        return false;
      const past = data.past.map((project: unknown) => projectSchema.parse(project));
      const future = data.future.map((project: unknown) => projectSchema.parse(project));
      this.past = past;
      this.future = future;
      return true;
    } catch {
      return false;
    }
  }
}
