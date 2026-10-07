import * as THREE from 'three';

export type ModelMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

export interface BatchPart {
  id: string;
  shape: string;
  style: string;
  origin: [number, number, number];
  mesh: THREE.Mesh<THREE.BufferGeometry, ModelMaterial[]>;
  outline: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}
interface SharedGeometry {
  surface: THREE.BufferGeometry;
  edges: THREE.BufferAttribute;
}
interface Batch {
  parts: BatchPart[];
  surface: THREE.InstancedMesh;
  edges: THREE.LineSegments<THREE.InstancedBufferGeometry, THREE.LineBasicMaterial>;
  offsets: THREE.InstancedBufferAttribute;
  visibility: boolean[];
  capacity: number;
}

/** Render repeated parts together; individual meshes remain exact picking proxies. */
export function createBodyBatches(scene: THREE.Object3D, allowTransparent = false) {
  const group = new THREE.Group();
  scene.add(group);
  const shapes = new Map<string, SharedGeometry>();
  let batches = new Map<string, Batch>();
  let previous: BatchPart[] = [];
  const matrix = new THREE.Matrix4();
  const release = (batch: Batch) => {
    group.remove(batch.surface, batch.edges);
    batch.surface.dispose();
    (batch.surface.material as THREE.Material).dispose();
    batch.edges.geometry.dispose();
    batch.edges.material.dispose();
  };
  const updateVisibility = () => {
    for (const batch of batches.values()) {
      let changed = false;
      batch.parts.forEach((part, index) => {
        const visible = part.mesh.visible;
        if (visible === batch.visibility[index]) return;
        batch.visibility[index] = visible;
        matrix.makeScale(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
        matrix.setPosition(...part.origin);
        batch.surface.setMatrixAt(index, matrix);
        batch.offsets.setXYZW(index, ...part.origin, part.outline.visible ? 1 : 0);
        changed = true;
      });
      if (changed) {
        batch.surface.instanceMatrix.needsUpdate = true;
        batch.offsets.needsUpdate = true;
      }
    }
  };
  return {
    group,
    updateVisibility,
    sync(parts: BatchPart[]) {
      for (const part of previous) {
        part.mesh.material.forEach((material) => {
          material.visible = part.mesh.userData.modelDisplay !== 'wireframe';
        });
        part.outline.material.visible = true;
        part.mesh.userData.batched = false;
      }
      previous = parts;
      const candidates = new Map<string, BatchPart[]>();
      for (const part of parts) {
        const material = part.mesh.material[0];
        if (
          // Coplanar sketches retain their individual creation order, including
          // after selection changes. Solid parts continue to share draw calls.
          part.mesh.userData.surfacePriority ||
          part.mesh.material.length !== 1 ||
          (material.transparent && !allowTransparent) ||
          part.outline.material instanceof THREE.LineDashedMaterial
        )
          continue;
        const key = part.shape + '|' + part.style;
        const list = candidates.get(key) ?? [];
        list.push(part);
        candidates.set(key, list);
      }
      const next = new Map<string, Batch>();
      const usedShapes = new Set<string>();
      for (const [key, list] of candidates) {
        if (list.length < 2) continue;
        const first = list[0];
        usedShapes.add(first.shape);
        let shape = shapes.get(first.shape);
        if (!shape) {
          const surface = first.mesh.geometry.clone();
          surface.translate(...(first.origin.map((n) => -n) as [number, number, number]));
          const localEdges = first.outline.geometry.clone();
          localEdges.translate(...(first.origin.map((n) => -n) as [number, number, number]));
          shape = { surface, edges: localEdges.getAttribute('position') as THREE.BufferAttribute };
          localEdges.dispose();
          shapes.set(first.shape, shape);
        }
        let batch = batches.get(key);
        if (batch && batch.capacity < list.length) {
          release(batch);
          batch = undefined;
        }
        if (!batch) {
          const capacity = Math.pow(2, Math.ceil(Math.log2(list.length)));
          const surface = new THREE.InstancedMesh(
            shape.surface,
            first.mesh.material[0].clone(),
            capacity,
          );
          surface.frustumCulled = false;
          const offsets = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
          offsets.setUsage(THREE.DynamicDrawUsage);
          const geometry = new THREE.InstancedBufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(shape.edges.array, 3));
          geometry.setAttribute('instanceOffset', offsets);
          const material = first.outline.material.clone();
          material.onBeforeCompile = (shader) => {
            shader.vertexShader = 'attribute vec4 instanceOffset;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              'vec3 transformed = vec3(position) + instanceOffset.xyz;',
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <project_vertex>',
              '#include <project_vertex>\nif (instanceOffset.w < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
            );
          };
          material.customProgramCacheKey = () => 'nivo-instance-edges-v1';
          const edges = new THREE.LineSegments(geometry, material);
          edges.frustumCulled = false;
          batch = { parts: list, surface, edges, offsets, visibility: [], capacity };
          group.add(surface, edges);
        }
        // Source material may have changed while the visual signature stayed the same.
        (batch.surface.material as THREE.Material).copy(first.mesh.material[0]);
        (batch.surface.material as THREE.Material).visible = true;
        batch.surface.visible = first.mesh.userData.modelDisplay !== 'wireframe';
        batch.surface.castShadow = first.mesh.castShadow;
        batch.surface.count = list.length;
        batch.edges.geometry.instanceCount = list.length;
        batch.parts = list;
        batch.visibility = [];
        for (const part of list) {
          part.mesh.material[0].visible = false;
          part.outline.material.visible = false;
          part.mesh.userData.batched = true;
        }
        next.set(key, batch);
      }
      for (const [key, batch] of batches) if (!next.has(key)) release(batch);
      batches = next;
      for (const [key, shape] of shapes)
        if (!usedShapes.has(key)) {
          shape.surface.dispose();
          shapes.delete(key);
        }
      updateVisibility();
      return batches.size;
    },
    dispose() {
      batches.forEach(release);
      shapes.forEach((shape) => shape.surface.dispose());
      batches.clear();
      shapes.clear();
      previous = [];
      scene.remove(group);
    },
  };
}
