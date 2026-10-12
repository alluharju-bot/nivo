import * as THREE from 'three';

/** The pinned generator reuses an 8-bit material attribute when the vertex count
 * is unchanged, even if a repaint introduces more than 255 material groups. */
export function resetTraceMaterialIndices(geometry: THREE.BufferGeometry) {
  geometry.deleteAttribute('materialIndex');
}

/** Compact a material's triangles without copying the whole part for each face.
 * Separate vertex buffers also prevent material IDs leaking across shared vertices. */
function materialGeometry(source: THREE.BufferGeometry, corners: number[]) {
  const remap = new Map<number, number>(),
    vertices: number[] = [];
  const indices = corners.map((corner) => {
    const vertex = source.index ? source.index.getX(corner) : corner;
    let next = remap.get(vertex);
    if (next === undefined) {
      next = vertices.length;
      remap.set(vertex, next);
      vertices.push(vertex);
    }
    return next;
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const copy = new THREE.Float32BufferAttribute(
      vertices.length * attribute.itemSize,
      attribute.itemSize,
    );
    vertices.forEach((vertex, i) => {
      for (let c = 0; c < attribute.itemSize; c++)
        copy.setComponent(i, c, attribute.getComponent(vertex, c));
    });
    geometry.setAttribute(name, copy);
  }
  geometry.setIndex(indices);
  return geometry;
}

/** Apply only to a private render snapshot. The pinned tracer (0.0.26) creates
 * one material group per mesh while flattening mesh.material arrays. Feed it
 * single-material meshes so a painted LED face cannot shift every later part's
 * material index. Keep material identities for live finish/texture updates. */
export function prepareTraceMaterials(scene: THREE.Scene): () => void {
  const meshes: THREE.Mesh[] = [],
    owned: THREE.BufferGeometry[] = [];
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  for (const mesh of meshes) {
    const source = mesh.geometry;
    const total = source.index?.count ?? source.attributes.position.count;
    const start = source.drawRange.start,
      end = Math.min(total, start + source.drawRange.count);
    if (
      (!Array.isArray(mesh.material) || mesh.material.length === 1) &&
      start === 0 &&
      end === total
    ) {
      if (Array.isArray(mesh.material)) mesh.material = mesh.material[0];
      continue;
    }
    const byMaterial = new Map<THREE.Material, number[]>();
    const groups = Array.isArray(mesh.material)
      ? source.groups
      : [{ start: 0, count: total, materialIndex: 0 }];
    for (const range of groups) {
      const material = Array.isArray(mesh.material)
        ? mesh.material[range.materialIndex ?? 0]
        : mesh.material;
      if (!material) continue;
      let corners = byMaterial.get(material);
      if (!corners) {
        corners = [];
        byMaterial.set(material, corners);
      }
      for (let i = Math.max(start, range.start); i < Math.min(end, range.start + range.count); i++)
        corners.push(i);
    }
    const group = new THREE.Group();
    group.copy(mesh, false);
    mesh.parent!.add(group);
    mesh.removeFromParent();
    for (const child of [...mesh.children]) group.add(child);
    for (const [material, corners] of byMaterial) {
      if (!corners.length) continue;
      const geometry = materialGeometry(source, corners);
      owned.push(geometry);
      const surface = new THREE.Mesh(geometry, material);
      surface.castShadow = mesh.castShadow;
      surface.receiveShadow = mesh.receiveShadow;
      surface.layers.mask = mesh.layers.mask;
      group.add(surface);
    }
  }
  scene.updateMatrixWorld(true);
  return () => {
    owned.splice(0).forEach((geometry) => geometry.dispose());
  };
}
