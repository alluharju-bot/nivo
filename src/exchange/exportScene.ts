import { attachAnimation } from './animationExport';
import type { AnimationData } from '../model/animation';
import type { BodyGroup } from '../model/project';
import { attachMotions } from './motionExport';
import type { Motion } from '../model/motion';
import { layerDomain } from '../render/layers';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type MeshPhysicalMaterial,
} from 'three';
import type { Body, Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { faceMaterialGroups } from '../render/faceMaterials';
import {
  createMaterialLibrary,
  materialUV,
  textureFrameMatrix,
  disposeMaterial,
} from '../render/materials';
import { mirrorBacking } from '../render/mirror';
import { appearancePreset, defaultAppearance } from '../model/materials';
import type { LodMesh } from './lod';

export interface GlbOptions {
  signal?: AbortSignal;
  motions?: Motion[];
  animation?: AnimationData;
  groups?: BodyGroup[];
  instances?: boolean;
  ratio?: number;
  error?: number;
  maxTextureSize?: number;
}
const numbers = (g: BufferGeometry) => [
  ...Object.keys(g.attributes)
    .sort()
    .map((key) => g.getAttribute(key).array),
  g.index!.array,
];
function hashGeometry(g: BufferGeometry) {
  let hash = 2166136261;
  for (const values of numbers(g)) {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
  }
  return `${hash >>> 0}:${JSON.stringify(g.groups)}`;
}
function equalGeometry(a: BufferGeometry, b: BufferGeometry) {
  const x = numbers(a),
    y = numbers(b);
  return (
    x.length === y.length &&
    x.every((v, j) => v.length === y[j].length && v.every((n, i) => n === y[j][i]))
  );
}
export function geometryPayload(g: BufferGeometry): LodMesh {
  return {
    positions: Array.from(g.getAttribute('position').array),
    normals: Array.from(g.getAttribute('normal').array),
    uv: Array.from(g.getAttribute('uv').array),
    indices: Array.from(g.index!.array),
    groups: g.groups.map((group) => ({ ...group })),
  };
}
export function geometryFromPayload(data: LodMesh) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(data.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(data.uv, 2));
  g.setIndex(data.indices);
  g.groups = data.groups;
  return g;
}
export async function exportScene(
  bodies: Body[],
  meshes: BodyMesh[],
  assets: Project['assets'],
  options: GlbOptions = {},
) {
  const library = createMaterialLibrary(() => {}),
    root = new Group();
  const geometries = new Map<string, BufferGeometry[]>(),
    materials = new Map<string, MeshPhysicalMaterial>();
  let worker: Worker | undefined;
  const release = () => {
    worker?.terminate();
    library.dispose();
    for (const bucket of geometries.values()) bucket.forEach((g) => g.dispose());
    materials.forEach(disposeMaterial);
    root.traverse((o) => {
      if (o instanceof InstancedMesh) o.dispose();
    });
  };
  try {
    options.signal?.throwIfAborted();
    const byId = new Map(meshes.map((m) => [m.id, m]));
    const missing = bodies.filter((b) => !byId.get(b.id)?.triangles.length);
    if (missing.length)
      throw new Error(
        `Odota osien geometrian valmistumista ennen vientiä (${missing.length} osaa).`,
      );
    library.beginFrame();
    for (const body of bodies) {
      const data = byId.get(body.id)!;
      let geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      materialUV(geometry, body);
      const paint: MeshPhysicalMaterial[] = [];
      for (const range of faceMaterialGroups(geometry, body, data)) {
        const b = range.source;
        const appearance = b.appearance ?? defaultAppearance(b.material),
          preset = appearancePreset(appearance);
        const domain = appearance.layers?.length
          ? layerDomain(geometry, range.start, range.count)
          : undefined;
        // Optical thickness changes the material; names/IDs/locations do not.
        const key = JSON.stringify([
          b.color,
          appearance,
          range.reflective,
          domain,
          (appearance.transmission ?? preset.transmission ?? 0) > 0
            ? Math.min(b.feature.width, b.feature.depth, b.feature.height)
            : 0,
        ]);
        let material = materials.get(key);
        if (!material) {
          material = library.create(b, assets, domain);
          if (!range.reflective) mirrorBacking(material);
          // glTF optical distances use metres, independently of the root transform.
          material.thickness *= 0.001;
          if (Number.isFinite(material.attenuationDistance)) material.attenuationDistance *= 0.001;
          materials.set(key, material);
        }
        let index = paint.indexOf(material);
        if (index < 0) {
          index = paint.length;
          paint.push(material);
        }
        const last = geometry.groups.at(-1);
        if (last?.materialIndex === index && last.start + last.count === range.start)
          last.count += range.count;
        else geometry.addGroup(range.start, range.count, index);
      }
      const frame = textureFrameMatrix(body);
      geometry.applyMatrix4(frame.clone().invert());
      const key = hashGeometry(geometry),
        bucket = geometries.get(key) ?? [];
      const shared = bucket.find((g) => equalGeometry(g, geometry));
      if (shared) {
        geometry.dispose();
        geometry = shared;
      } else {
        bucket.push(geometry);
        geometries.set(key, bucket);
      }
      const object = new Mesh(geometry, paint.length === 1 ? paint[0] : paint);
      object.name = body.name;
      object.userData.nivoId = body.id;
      object.matrix.copy(frame);
      frame.decompose(object.position, object.quaternion, object.scale);
      object.matrixAutoUpdate = false;
      root.add(object);
    }
    library.endFrame();
    await library.ready();
    options.signal?.throwIfAborted();
    if (options.ratio && options.ratio < 1) {
      worker = new Worker(new URL('./lod.worker.ts', import.meta.url), { type: 'module' });
      for (const bucket of geometries.values())
        for (let i = 0; i < bucket.length; i++) {
          const old = bucket[i];
          const payload = await new Promise<LodMesh>((resolve, reject) => {
            const finish = (error?: Error, mesh?: LodMesh) => {
              clearTimeout(timer);
              options.signal?.removeEventListener('abort', abort);
              error ? reject(error) : resolve(mesh!);
            };
            const abort = () => {
              worker?.terminate();
              finish(new DOMException('LOD-laskenta peruttu.', 'AbortError'));
            };
            const timer = setTimeout(
              () => finish(new Error('LOD-kevennys ylitti aikarajan. Vie alkuperäinen tarkkuus.')),
              60000,
            );
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) {
              abort();
              return;
            }
            worker!.onmessage = (e: MessageEvent<{ mesh: LodMesh; error?: string }>) => {
              finish(e.data.error ? new Error(e.data.error) : undefined, e.data.mesh);
            };
            worker!.onerror = () => {
              finish(new Error('LOD-kevennystä ei voitu käynnistää.'));
            };
            worker!.postMessage({
              mesh: geometryPayload(old),
              ratio: options.ratio,
              error: options.error ?? 0.001,
            });
          });
          const reduced = geometryFromPayload(payload);
          bucket[i] = reduced;
          root.traverse((o) => {
            if (o instanceof Mesh && o.geometry === old) o.geometry = reduced;
          });
          old.dispose();
        }
    }
    const motions = (options.motions ?? []).filter((m) =>
      m.movingIds.some((id) => bodies.some((b) => b.id === id)),
    );
    const animatedIds = new Set(motions.flatMap((m) => [m.anchorId, ...m.movingIds]));
    const animations = options.animation?.clips.length
      ? attachAnimation(root, bodies, options.animation, options.groups, motions)
      : attachMotions(root, bodies, motions);
    if (options.instances) {
      const batches = new Map<string, Mesh[]>();
      for (const child of root.children)
        if (child instanceof Mesh && !animatedIds.has(child.userData.nivoId)) {
          const ids = (Array.isArray(child.material) ? child.material : [child.material]).map(
            (m) => m.uuid,
          );
          const key = `${child.geometry.uuid}:${ids.join(',')}`;
          const list = batches.get(key) ?? [];
          list.push(child);
          batches.set(key, list);
        }
      for (const list of batches.values())
        if (list.length > 1) {
          const batch = new InstancedMesh(list[0].geometry, list[0].material, list.length);
          batch.name = list[0].name;
          batch.userData.nivoInstances = list.map((part, i) => {
            batch.setMatrixAt(i, part.matrix);
            root.remove(part);
            return { name: part.name, id: part.userData.nivoId };
          });
          root.add(batch);
        }
    }
    root.rotation.x = -Math.PI / 2;
    root.scale.setScalar(0.001);
    root.updateMatrixWorld(true);
    let triangles = 0,
      draws = 0;
    root.traverse((o) => {
      if (o instanceof Mesh) {
        triangles += (o.geometry.index!.count / 3) * (o instanceof InstancedMesh ? o.count : 1);
        draws += o.geometry.groups.length || 1;
      }
    });
    return {
      root,
      animations,
      release,
      stats: {
        parts: bodies.length,
        triangles,
        geometries: [...geometries.values()].reduce((n, b) => n + b.length, 0),
        materials: materials.size,
        drawCalls: draws,
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
