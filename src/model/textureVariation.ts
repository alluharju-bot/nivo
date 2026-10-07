import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';
import { textureFrameMatrix } from '../render/materials';
import { bodyLocked } from './groups';
import { defaultAppearance, findPreset } from './materials';
import type { Body, Project } from './project';

export interface TextureVariation {
  spread: number;
  rotation: number;
  alignWood: boolean;
}
export const hasTexture = (body: Body) => {
  const appearance = body.appearance ?? defaultAppearance(body.material);
  return !!(appearance.assetId || findPreset(appearance.preset).pattern);
};

/** Align V (the built-in wood grain) with the long side of the broad face, in the part's own frame. */
export function woodGrainRotation(body: Body, mesh?: Pick<BodyMesh, 'vertices'>): number {
  let size = [body.feature.width, body.feature.depth, body.feature.height];
  if (mesh?.vertices.length) {
    const inverse = textureFrameMatrix(body).invert(),
      box = new THREE.Box3(),
      point = new THREE.Vector3();
    for (let i = 0; i < mesh.vertices.length; i += 3)
      box.expandByPoint(point.fromArray(mesh.vertices, i).applyMatrix4(inverse));
    size = box.getSize(point).toArray();
  }
  const longest = size.indexOf(Math.max(...size));
  const face = size.indexOf(Math.min(...size));
  const v = face === 2 ? 1 : 2;
  return longest === v ? 0 : 90;
}

/** Instance-local placement: geometry links stay intact and unselected copies are untouched. */
export function varyTextures(
  project: Project,
  ids: string[],
  options: TextureVariation,
  seed: number,
  meshes: Pick<BodyMesh, 'id' | 'vertices'>[] = [],
): Project {
  if (
    !Number.isFinite(options.spread) ||
    options.spread < 0 ||
    options.spread > 1 ||
    !Number.isFinite(options.rotation) ||
    options.rotation < 0 ||
    options.rotation > 180
  )
    throw new Error('Tarkista tekstuurin hajonta.');
  const selected = new Set(ids),
    meshById = new Map(meshes.map((m) => [m.id, m]));
  if (
    project.bodies.some((b) => selected.has(b.id) && hasTexture(b) && bodyLocked(b, project.groups))
  )
    throw new Error('Vapauta valinnan Hold ennen tekstuurien muokkaamista.');
  return {
    ...project,
    bodies: project.bodies.map((body) => {
      if (!selected.has(body.id) || !hasTexture(body)) return body;
      // A per-instance seed makes the result independent of list order.
      let state = seed | 0;
      for (const char of body.id) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
      const random = () => {
        state += 0x6d2b79f5;
        let n = state;
        n = Math.imul(n ^ (n >>> 15), n | 1);
        n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
        return (((n ^ (n >>> 14)) >>> 0) / 4294967296) * 2 - 1;
      };
      const appearance = body.appearance ?? defaultAppearance(body.material),
        old = appearance.texture;
      const wood = ['oak', 'pine', 'birch', 'walnut'].includes(
        findPreset(appearance.preset).pattern ?? '',
      );
      const texture = {
        ...old,
        offsetX: THREE.MathUtils.clamp(
          old.offsetX + random() * old.width * options.spread,
          -100000,
          100000,
        ),
        offsetY: THREE.MathUtils.clamp(
          old.offsetY + random() * old.height * options.spread,
          -100000,
          100000,
        ),
        rotation:
          ((((options.alignWood && wood && !appearance.assetId
            ? woodGrainRotation(body, meshById.get(body.id))
            : old.rotation) +
            random() * options.rotation) %
            360) +
            360) %
          360,
      };
      return JSON.stringify(texture) === JSON.stringify(old)
        ? body
        : { ...body, localTexture: true, appearance: { ...appearance, texture } };
    }),
  };
}
