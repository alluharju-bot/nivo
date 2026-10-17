import XAtlas, { type XAtlasModule } from 'xatlas-web';
import wasmUrl from 'xatlas-web/dist/xatlas-web.wasm?url';
import { checkMesh, type SurfaceMesh } from './mesh';

let modulePromise: Promise<XAtlasModule> | undefined;
/** The binding accepts 16-bit input indices. Never truncate larger meshes silently. */
export async function unwrapMesh(mesh: SurfaceMesh): Promise<SurfaceMesh> {
  checkMesh(mesh);
  modulePromise ??= XAtlas({
    locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path),
  }).ready;
  const module = await modulePromise;
  module.createAtlas();
  try {
    const input = module.createMesh(mesh.positions.length / 3, mesh.indices.length, true, false);
    module.HEAPU16.set(mesh.indices, input.indexOffset / 2);
    module.HEAPF32.set(mesh.positions, input.positionOffset / 4);
    module.HEAPF32.set(mesh.normals, input.normalOffset / 4);
    const status = module.addMesh();
    if (status !== 0)
      throw new Error(`UV-karttaa ei saatu muodostettua (${status}). Tarkista verkko.`);
    module.generateAtlas();
    const data = module.getMeshData(input.meshId);
    const mapping = Array.from(
      new Uint32Array(module.HEAPU32.buffer, data.originalIndexOffset, data.newVertexCount),
    );
    const indices = Array.from(
      new Uint32Array(module.HEAPU32.buffer, data.indexOffset, data.newIndexCount),
    );
    const uv = Array.from(
      new Float32Array(module.HEAPF32.buffer, data.uvOffset, data.newVertexCount * 2),
    );
    // Resolve face IDs through the original triangle, even if atlas packing changes order.
    const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(':');
    const faces = new Map<string, number>();
    for (let i = 0; i < mesh.indices.length; i += 3)
      faces.set(key(mesh.indices.slice(i, i + 3)), mesh.faces[i / 3]);
    const result: SurfaceMesh = {
      positions: mapping.flatMap((i) => mesh.positions.slice(i * 3, i * 3 + 3)),
      normals: mapping.flatMap((i) => mesh.normals.slice(i * 3, i * 3 + 3)),
      indices,
      uv,
      mask: mesh.mask ? mapping.map((i) => mesh.mask![i]) : undefined,
      faces: Array.from(
        { length: indices.length / 3 },
        (_, t) => faces.get(key(indices.slice(t * 3, t * 3 + 3).map((i) => mapping[i]))) ?? 0,
      ),
    };
    checkMesh(result);
    if (uv.some((n) => n < -1e-5 || n > 1.00001))
      throw new Error('UV-kartan koordinaatit ylittävät tekstuurin rajat.');
    return result;
  } finally {
    module.destroyAtlas();
  }
}
