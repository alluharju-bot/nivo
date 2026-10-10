import type { AnyShape } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import type { BodyMesh } from './protocol';
import { createShape, meshBody } from './kernel';
import { bodyGeometryKey, bodyMeshKey } from './meshKey';
import { translateMesh } from './translateMesh';

type Entry = { key: string; geometry: string; origin: Vec3; shape: AnyShape; mesh: BodyMesh };
type Prepared = { key: string; shape: AnyShape; mesh?: BodyMesh };

/** Owns CAD wrappers. A placement change reuses the previous exact shape and
 * tessellation, including when the first/only instance in the scene moves. */
export class CadBuildCache {
  private entries = new Map<string, Entry>();
  private prepared = new Map<string, Prepared>();

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
    const templates = new Map<string, Entry>();
    for (const entry of this.entries.values())
      if (!templates.has(entry.geometry)) templates.set(entry.geometry, entry);
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
    for (const [id, entry] of this.entries) if (next.get(id) !== entry) entry.shape.delete();
    this.entries = next;
    this.clearPrepared();
    return [...next.values()];
  }

  dispose() {
    this.clearPrepared();
    for (const entry of this.entries.values()) entry.shape.delete();
    this.entries.clear();
  }
}

export type TransformCache = Pick<CadBuildCache, 'shape' | 'prepare' | 'get'>;
