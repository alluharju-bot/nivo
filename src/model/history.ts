import { parseProject, type Project } from './project';
import { actionInfoSchema, type ActionInfo } from './activity';

const MAX_SAVED_BYTES = 8 * 1024 * 1024;
const MAX_SAVED_STEPS = 20;

export class History {
  private past: Project[] = [];
  private future: Project[] = [];
  private weights = new WeakMap<Project, number>();
  private actions = new WeakMap<Project, ActionInfo>();
  get undoInfo() {
    return this.actions.get(this.current);
  }
  get redoInfo() {
    const next = this.peekRedo();
    return next && this.actions.get(next);
  }
  adopt(next: Project) {
    const info = this.actions.get(this.current);
    if (info) this.actions.set(next, info);
    this.current = next;
  }
  constructor(
    public current: Project,
    private memoryBudget = 64 * 1024 * 1024,
  ) {}
  private weight(project: Project) {
    let weight = this.weights.get(project);
    if (weight === undefined) {
      // Conservative serialized UTF-16 estimate; shared CAD features reduce the
      // actual retained object graph further. This bounds snapshots, not WebGL/WASM.
      weight = JSON.stringify(project).length * 2;
      this.weights.set(project, weight);
    }
    return weight;
  }
  private trimMemory() {
    let total = [...this.past, ...this.future, this.current].reduce(
      (n, p) => n + this.weight(p),
      0,
    );
    while (total > this.memoryBudget && (this.past.length || this.future.length)) {
      const list = this.past.length >= this.future.length ? this.past : this.future;
      total -= this.weight(list.shift()!);
    }
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next: Project, info?: ActionInfo) {
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.current = next;
    if (info) this.actions.set(next, info);
    this.future = [];
    this.trimMemory();
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
    // Encode each retained snapshot and asset once. Repeatedly stringifying the
    // entire history while trimming it freezes large models on every edit.
    const encoder = new TextEncoder();
    const pack = (p: Project) =>
      JSON.stringify({
        ...p,
        assets: p.assets ? Object.keys(p.assets) : undefined,
        _history: this.actions.get(p),
      });
    const current = pack(this.current),
      past: string[] = [],
      future: string[] = [];
    const assets = new Map<string, string>();
    let bytes = encoder.encode(current).length + 70;
    const extraAssets = (p: Project) =>
      Object.entries(p.assets ?? {})
        .filter(([id]) => !assets.has(id))
        .map(([id, asset]) => [id, `${JSON.stringify(id)}:${JSON.stringify(asset)}`] as const);
    const keepAssets = (entries: readonly (readonly [string, string])[]) =>
      entries.forEach(([id, data]) => assets.set(id, data));
    const initial = extraAssets(this.current);
    bytes += initial.reduce((sum, [, data]) => sum + encoder.encode(data).length + 1, 0);
    if (bytes > maxBytes) return;
    keepAssets(initial);
    const nextPast = this.past.slice(-maxSteps),
      nextFuture = this.future.slice(-maxSteps);
    let pastOpen = true,
      futureOpen = true;
    for (let step = 0; step < maxSteps; step++) {
      const usePast =
        pastOpen &&
        nextPast.length > 0 &&
        (!futureOpen || !nextFuture.length || past.length <= future.length);
      const source = usePast ? nextPast : nextFuture,
        destination = usePast ? past : future;
      if ((usePast && !pastOpen) || (!usePast && !futureOpen) || !source.length) break;
      const project = source.pop()!,
        data = pack(project),
        addedAssets = extraAssets(project);
      const size =
        encoder.encode(data).length +
        1 +
        addedAssets.reduce((sum, [, value]) => sum + encoder.encode(value).length + 1, 0);
      if (bytes + size > maxBytes) {
        if (usePast) pastOpen = false;
        else futureOpen = false;
        step--;
        continue;
      }
      bytes += size;
      keepAssets(addedAssets);
      destination.unshift(data);
    }
    const data = `{"version":2,"assets":{${[...assets.values()].join(',')}},"current":${current},"past":[${past.join(',')}],"future":[${future.join(',')}]}`;
    return encoder.encode(data).length <= maxBytes ? data : undefined;
  }

  /** A missing, damaged or stale history must never prevent opening the active model. */
  restore(serialized?: string): boolean {
    this.past = [];
    this.future = [];
    if (!serialized || new TextEncoder().encode(serialized).length > MAX_SAVED_BYTES) return false;
    try {
      const data = JSON.parse(serialized);
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
      if (
        data.version !== 1 ||
        !Array.isArray(data.past) ||
        !Array.isArray(data.future) ||
        data.past.length + data.future.length > MAX_SAVED_STEPS ||
        JSON.stringify(parseProject(JSON.stringify(data.current))) !==
          JSON.stringify(parseProject(JSON.stringify(this.current)))
      )
        return false;
      const past = data.past.map((project: unknown) => parseProject(JSON.stringify(project)));
      const future = data.future.map((project: unknown) => parseProject(JSON.stringify(project)));
      this.past = past;
      this.future = future;
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
