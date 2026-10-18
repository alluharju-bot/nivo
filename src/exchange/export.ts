import type { BodyMesh } from '../cad/protocol';
import type { Body, Project } from '../model/project';
import { exportScene, type GlbOptions } from './exportScene';

export type ExportMesh = Pick<BodyMesh, 'id' | 'vertices' | 'triangles'>;
export function stlBinary(meshes: ExportMesh[], bed = false): ArrayBuffer {
  const count = meshes.reduce((n, mesh) => n + mesh.triangles.length / 3, 0);
  if (!count || count > 5_000_000) throw new Error('STL-vientiin tarvitaan 1–5 000 000 kolmiota.');
  const data = new ArrayBuffer(84 + count * 50),
    view = new DataView(data);
  new Uint8Array(data, 0, 80).set(
    new TextEncoder().encode('Nivo binary STL | coordinates in millimetres'),
  );
  view.setUint32(80, count, true);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes)
    mesh.vertices.forEach((n, i) => {
      min[i % 3] = Math.min(min[i % 3], n);
      max[i % 3] = Math.max(max[i % 3], n);
    });
  const offset = bed ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]] : [0, 0, 0];
  let at = 84;
  for (const mesh of meshes)
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const p = [0, 1, 2].map((n) =>
        mesh.vertices.slice(mesh.triangles[i + n] * 3, mesh.triangles[i + n] * 3 + 3),
      );
      const a = p[1].map((n, k) => n - p[0][k]),
        b = p[2].map((n, k) => n - p[0][k]);
      const cross = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      const length = Math.hypot(...cross);
      if (!Number.isFinite(length) || length < 1e-12)
        throw new Error('Mallissa on nollakokoisia kolmioita. Tarkista pinta ennen STL-vientiä.');
      for (const n of cross) {
        view.setFloat32(at, n / length, true);
        at += 4;
      }
      for (const point of p)
        for (let k = 0; k < 3; k++) {
          view.setFloat32(at, point[k] - offset[k], true);
          at += 4;
        }
      at += 2;
    }
  return data;
}
export async function glbExport(
  bodies: Body[],
  meshes: BodyMesh[],
  assets: Project['assets'],
  options: GlbOptions = {},
): Promise<ArrayBuffer> {
  return (await exportGlbLevel(bodies, meshes, assets, options)).buffer;
}
async function exportGlbLevel(
  bodies: Body[],
  meshes: BodyMesh[],
  assets: Project['assets'],
  options: GlbOptions,
) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const scene = await exportScene(bodies, meshes, assets, options);
  try {
    options.signal?.throwIfAborted();
    const buffer = (await new GLTFExporter().parseAsync(scene.root, {
      binary: true,
      animations: scene.animations,
      maxTextureSize: options.maxTextureSize ?? Infinity,
    })) as ArrayBuffer;
    options.signal?.throwIfAborted();
    return { buffer, ...scene.stats };
  } finally {
    scene.release();
  }
}
/** Independent, portable GLBs. The consuming application chooses LOD distances;
 * core glTF has no automatic distance-switching convention. */
export async function glbLodPackage(
  bodies: Body[],
  meshes: BodyMesh[],
  assets: Project['assets'],
  instances: boolean,
  progress: (message: string) => void,
  motions?: Project['motions'],
) {
  return packGlbLods(await prepareGlbLods(bodies, meshes, assets, instances, progress, motions));
}

/** Prepare once: the preview and download use the exact same GLB buffers. */
export async function prepareGlbLods(
  bodies: Body[],
  meshes: BodyMesh[],
  assets: Project['assets'],
  instances: boolean,
  progress: (message: string) => void,
  motions?: Project['motions'],
  ratios: [number, number] = [0.5, 0.2],
  signal?: AbortSignal,
  errors: [number, number] = [0.001, 0.005],
) {
  if (
    !ratios.every(Number.isFinite) ||
    ratios[0] <= 0 ||
    ratios[0] >= 1 ||
    ratios[1] <= 0 ||
    ratios[1] >= ratios[0]
  )
    throw new Error('Valitse 0 < LOD2 < LOD1 < 100 %.');
  if (!errors.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
    throw new Error('Virheellinen LOD-muotovirheen raja.');
  const files: Record<string, Uint8Array> = {},
    levels = [];
  for (const [level, ratio, error, maxTextureSize] of [
    [0, 1, 0, 2048],
    [1, ratios[0], errors[0], 1024],
    [2, ratios[1], errors[1], 512],
  ]) {
    signal?.throwIfAborted();
    progress(`Valmistellaan LOD${level} · ${level + 1}/3…`);
    const result = await exportGlbLevel(bodies, meshes, assets, {
      instances,
      motions,
      ratio,
      error,
      maxTextureSize,
      signal,
    });
    const file = `LOD${level}.glb`;
    files[file] = new Uint8Array(result.buffer);
    const { buffer: _buffer, ...stats } = result;
    levels.push({
      file,
      targetTriangleRatio: ratio,
      maxRelativeError: error,
      maxTextureSize,
      ...stats,
      bytes: result.buffer.byteLength,
    });
  }
  return { files, levels, instances };
}
export type PreparedLods = Awaited<ReturnType<typeof prepareGlbLods>>;

export async function packGlbLods(prepared: PreparedLods) {
  const { zip, strToU8 } = await import('fflate');
  const { levels, instances } = prepared;
  const files = { ...prepared.files };
  files['manifest.json'] = strToU8(
    JSON.stringify(
      {
        version: 1,
        units: 'metres',
        up: 'Y',
        instancing: instances ? 'EXT_mesh_gpu_instancing' : 'shared glTF meshes',
        levels,
        notes:
          'Separate LOD files. Configure distance switching in the destination application. Ratios are targets; boundaries and material seams limit simplification. Source project is unchanged.',
      },
      null,
      2,
    ),
  );
  files['LUE-MINUT.txt'] = strToU8(
    'LOD0 = lähelle, LOD1 = keskietäisyydelle, LOD2 = kauas.\nAseta etäisyydet kohdeohjelmassa. Älä näytä kaikkia versioita päällekkäin.\nAukot ja materiaalirajat säilytetään, joten kevyt malli ei välttämättä kevene tavoiteprosenttiin.\nToteutuneet kolmiomäärät ja tiedostokoot ovat manifest.json-tiedostossa.\n' +
      (instances
        ? 'GPU-instanssit edellyttävät EXT_mesh_gpu_instancing-tukea.\n'
        : 'Kopiot viittaavat samaan geometriaan, mutta säilyvät erillisinä objekteina.\n'),
  );
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) =>
    zip(files, { level: 0 }, (error, data) =>
      error ? reject(error) : resolve(new Uint8Array(data)),
    ),
  );
}
