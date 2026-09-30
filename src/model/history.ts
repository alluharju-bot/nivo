import type { Project } from './project';

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
}
