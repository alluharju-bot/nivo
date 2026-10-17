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
    const buffer = (await new GLTFExporter().parseAsync(scene.root, {
      binary: true,
      maxTextureSize: options.maxTextureSize ?? Infinity,
    })) as ArrayBuffer;
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
) {
  const { zip, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {},
    levels = [];
  for (const [level, ratio, error, maxTextureSize] of [
    [0, 1, 0, 2048],
    [1, 0.5, 0.001, 1024],
    [2, 0.2, 0.005, 512],
  ]) {
    progress(`Valmistellaan LOD ${level + 1}/3…`);
    const result = await exportGlbLevel(bodies, meshes, assets, {
      instances,
      ratio,
      error,
      maxTextureSize,
    });
    const file = `LOD${level}.glb`;
    files[file] = new Uint8Array(result.buffer);
    levels.push({
      file,
      targetTriangleRatio: ratio,
      maxRelativeError: error,
      maxTextureSize,
      ...Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'buffer')),
      bytes: result.buffer.byteLength,
    });
  }
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
