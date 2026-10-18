import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export interface LodMesh {
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
  groups: { start: number; count: number; materialIndex?: number }[];
}
/** Attribute seams and material/open boundaries remain locked. A target ratio
 * is a ceiling on reduction, never permission to close a window or move a seam. */
export async function simplifyExportMesh(
  input: LodMesh,
  ratio: number,
  error: number,
): Promise<LodMesh> {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1 || !Number.isFinite(error) || error < 0)
    throw new Error('Virheellinen LOD-tarkkuus.');
  if (ratio === 1 || input.indices.length <= 36) return input;
  await MeshoptSimplifier.ready;
  const source = new BufferGeometry();
  source.setAttribute('position', new Float32BufferAttribute(input.positions, 3));
  source.setAttribute('normal', new Float32BufferAttribute(input.normals, 3));
  source.setAttribute('uv', new Float32BufferAttribute(input.uv, 2));
  source.setIndex(input.indices);
  const welded = mergeVertices(source, 1e-6);
  source.dispose();
  try {
    const positions = new Float32Array(welded.getAttribute('position').array);
    const normals = welded.getAttribute('normal'),
      uv = welded.getAttribute('uv');
    const attrs = new Float32Array(normals.count * 5);
    let uvScale = 1;
    for (let i = 0; i < uv.array.length; i++) uvScale = Math.max(uvScale, Math.abs(uv.array[i]));
    for (let i = 0; i < normals.count; i++)
      attrs.set(
        [
          normals.getX(i),
          normals.getY(i),
          normals.getZ(i),
          uv.getX(i) / uvScale,
          uv.getY(i) / uvScale,
        ],
        i * 5,
      );
    const all = new Uint32Array(welded.index!.array),
      indices: number[] = [],
      groups: LodMesh['groups'] = [];
    for (const group of input.groups) {
      const before = all.slice(group.start, group.start + group.count);
      const [after] = MeshoptSimplifier.simplifyWithAttributes(
        before,
        positions,
        3,
        attrs,
        5,
        [1, 1, 1, 1, 1],
        null,
        Math.max(3, Math.floor((before.length * ratio) / 3) * 3),
        error,
        ['LockBorder'],
      );
      const result = after.length ? after : before;
      groups.push({ ...group, start: indices.length, count: result.length });
      for (const id of result) indices.push(id);
    }
    // Compact unused vertices in every LOD; merely changing indices saves no vertex memory.
    const remap = new Map<number, number>(),
      result: LodMesh = { positions: [], normals: [], uv: [], indices: [], groups };
    for (const id of indices) {
      if (!remap.has(id)) {
        remap.set(id, remap.size);
        result.positions.push(...positions.slice(id * 3, id * 3 + 3));
        result.normals.push(normals.getX(id), normals.getY(id), normals.getZ(id));
        result.uv.push(uv.getX(id), uv.getY(id));
      }
      result.indices.push(remap.get(id)!);
    }
    return result;
  } finally {
    welded.dispose();
  }
}
