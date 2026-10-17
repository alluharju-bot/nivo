import type { SurfaceMesh } from './mesh';
import type { SurfaceMaps } from './maps';
export interface SurfaceDraft {
  mesh: SurfaceMesh;
  maps: SurfaceMaps;
  atlas: boolean;
  baked: boolean;
  selection?: number[];
  loops?: number[][];
}
function bytes(draft: SurfaceDraft) {
  const m = draft.mesh;
  return (
    (m.positions.length +
      m.normals.length +
      m.indices.length +
      m.faces.length +
      (m.mask?.length ?? 0) +
      (m.uv?.length ?? 0)) *
      8 +
    Object.values(draft.maps).reduce((n, m) => n + (m?.pixels.byteLength ?? 0), 0) +
    ((draft.selection?.length ?? 0) + (draft.loops?.reduce((n, ids) => n + ids.length, 0) ?? 0)) * 8
  );
}
/** Local immutable drafts; accepted work becomes one atomic project history step. */
export class SurfaceHistory {
  past: SurfaceDraft[] = [];
  future: SurfaceDraft[] = [];
  push(draft: SurfaceDraft) {
    this.past.push(draft);
    this.future = [];
    let size = this.past.reduce((n, d) => n + bytes(d), 0);
    while (this.past.length > 1 && (this.past.length > 30 || size > 64 * 1024 * 1024))
      size -= bytes(this.past.shift()!);
  }
  undo(current: SurfaceDraft) {
    const old = this.past.pop();
    if (old) this.future.push(current);
    return old;
  }
  redo(current: SurfaceDraft) {
    const next = this.future.pop();
    if (next) this.past.push(current);
    return next;
  }
}
