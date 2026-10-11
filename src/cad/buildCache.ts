import type { AnyShape } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import type { BodyMesh } from './protocol';
import { createShape, meshBody } from './kernel';
import { bodyGeometryKey, bodyMeshKey } from './meshKey';
import { translateMesh } from './translateMesh';

type Entry = { key: string; geometry: string; origin: Vec3; shape: AnyShape; mesh: BodyMesh };
type Prepared = { key: string; shape: AnyShape; mesh?: BodyMesh };

function retainedMeshBytes(value: unknown, seen = new Set<object>()): number {
  if (typeof value === 'string') return value.length * 2;
  if (!value || typeof value !== 'object') return 8;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    if (!value.length || typeof value[0] === 'number') return 32 + value.length * 8;
    return 32 + value.reduce((bytes, item) => bytes + 8 + retainedMeshBytes(item, seen), 0);
  }
  return (
    48 +
    Object.values(value).reduce<number>(
      (bytes, item) => bytes + 8 + retainedMeshBytes(item, seen),
      0,
    )
  );
}

/** Owns CAD wrappers. A placement change reuses the previous exact shape and
 * tessellation, including when the first/only instance in the scene moves. */
export class CadBuildCache {
  private entries = new Map<string, Entry>();
  private prepared = new Map<string, Prepared>();
  // One representative per geometry, not one copy per placed instance. Old
  // versions are useful for undo/redo and own their CAD wrappers until evicted.
  private retained = new Map<string, { entry: Entry; bytes: number }>();
  private retainedBytes = 0;

  constructor(
    private historyBudget = 64 * 1024 * 1024,
    private historyLimit = 24,
  ) {}

  get historySize() {
    return { geometries: this.retained.size, estimatedBytes: this.retainedBytes };
  }

  private forget(geometry: string) {
    const old = this.retained.get(geometry);
    if (!old) return;
    old.entry.shape.delete();
    this.retainedBytes -= old.bytes;
    this.retained.delete(geometry);
  }

  private retain(entry: Entry) {
    // Deleting a copied assembly can retire thousands of identical instances.
    // Count/store its geometry once, not once per instance.
    if (this.retained.has(entry.geometry)) {
      entry.shape.delete();
      return;
    }
    // Include serialized geometry, JS arrays/metadata and a conservative CAD
    // allowance. Native OCCT allocations are not directly measurable in JS.
    const bytes = entry.geometry.length * 4 + retainedMeshBytes(entry.mesh);
    if (bytes > this.historyBudget || this.historyLimit < 1) {
      entry.shape.delete();
      return;
    }
    this.retained.set(entry.geometry, { entry, bytes });
    this.retainedBytes += bytes;
    while (this.retainedBytes > this.historyBudget || this.retained.size > this.historyLimit)
      this.forget(this.retained.keys().next().value!);
  }

  get(body: Body) {
    const entry = this.entries.get(body.id);
    return entry?.key === bodyMeshKey(body) ? entry : undefined;
  }

  /** The caller owns this wrapper; cached shapes are never handed out to mutate. */
  shape(body: Body) {
    const key = bodyMeshKey(body),
      prepared = this.prepared.get(body.id);
    return prepared?.key === key
      ? prepared.shape.clone()
      : (this.get(body)?.shape.clone() ?? createShape(body));
  }

  /** Keep a completed transform until the validated project is committed. */
  prepare(body: Body, shape: AnyShape, mesh?: BodyMesh) {
    this.prepared.get(body.id)?.shape.delete();
    this.prepared.set(body.id, { key: bodyMeshKey(body), shape: shape.clone(), mesh });
  }

  clearPrepared() {
    for (const entry of this.prepared.values()) entry.shape.delete();
    this.prepared.clear();
  }

  build(bodies: Body[], preview?: { key: string; mesh: BodyMesh }): Entry[] {
    const next = new Map<string, Entry>(),
      allocated: AnyShape[] = [];
    const templates = new Map<string, Entry>(
      [...this.retained].map(([key, value]) => [key, value.entry]),
    );
    for (const entry of this.entries.values()) templates.set(entry.geometry, entry);
    try {
      for (const body of bodies) {
        const key = bodyMeshKey(body),
          geometry = bodyGeometryKey(body);
        const previous = this.entries.get(body.id);
        if (previous?.key === key) next.set(body.id, previous);
        else {
          const template = templates.get(geometry),
            prepared = this.prepared.get(body.id);
          const ready = prepared?.key === key ? prepared : undefined;
          const delta = template
            ? (body.origin.map((n, i) => n - template.origin[i]) as Vec3)
            : undefined;
          const shape = ready
            ? ready.shape.clone()
            : template
              ? template.shape.clone().translate(delta!)
              : createShape(body);
          allocated.push(shape);
          const mesh =
            ready?.mesh ??
            (template
              ? translateMesh(template.mesh, body.id, delta!)
              : preview?.mesh.id === body.id && preview.key === key
                ? preview.mesh
                : meshBody(body, shape));
          next.set(body.id, { key, geometry, origin: body.origin, shape, mesh });
        }
        if (!templates.has(geometry)) templates.set(geometry, next.get(body.id)!);
      }
    } catch (error) {
      allocated.forEach((shape) => shape.delete());
      throw error;
    }
    const activeGeometry = new Set([...next.values()].map((entry) => entry.geometry));
    // Release restored versions before making room for the state we left; doing
    // this afterward would evict an extra undo version at the budget boundary.
    for (const geometry of activeGeometry) this.forget(geometry);
    for (const [id, entry] of this.entries) {
      if (next.get(id) === entry) continue;
      if (activeGeometry.has(entry.geometry)) entry.shape.delete();
      else this.retain(entry);
    }
    this.entries = next;
    this.clearPrepared();
    return [...next.values()];
  }

  dispose() {
    this.clearPrepared();
    for (const entry of this.entries.values()) entry.shape.delete();
    this.entries.clear();
    for (const geometry of this.retained.keys()) this.forget(geometry);
  }
}

export type TransformCache = Pick<CadBuildCache, 'shape' | 'prepare' | 'get'>;
