import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { Body, Project } from '../model/project';
import { renderFaceMaterials } from '../render/faceMaterials';

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
): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { createMaterialLibrary, materialUV, disposeMaterial } =
    await import('../render/materials');
  const library = createMaterialLibrary(() => {});
  library.beginFrame();
  const root = new Group();
  try {
    const byId = new Map(meshes.map((m) => [m.id, m]));
    for (const body of bodies) {
      const data = byId.get(body.id);
      if (!data?.triangles.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      materialUV(geometry, body);
      const material = renderFaceMaterials(geometry, body, data, (source) =>
        library.create(source, assets),
      );
      const mesh = new Mesh(geometry, material);
      mesh.name = body.name;
      root.add(mesh);
    }
    library.endFrame();
    await library.ready();
    root.rotation.x = -Math.PI / 2;
    root.scale.setScalar(0.001);
    root.updateMatrixWorld(true);
    return (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  } finally {
    library.dispose();
    root.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(
          disposeMaterial,
        );
      }
    });
  }
}
