import * as THREE from 'three';
import type { BodyMesh, CadFace, FaceTarget } from '../cad/protocol';
import { faceColors } from './faceFeedback';

/** Retain the selected face and GPU programs while only its extrusion distance changes. */
export function extrusionPreview(scene: THREE.Object3D) {
  const group = new THREE.Group();
  scene.add(group);
  let source: BodyMesh | undefined, selectedFace: CadFace | undefined;
  let surface: THREE.Mesh | undefined, outline: THREE.LineSegments | undefined;
  let links: THREE.LineSegments | undefined;
  let vertices: number[] = [];
  const clear = () => {
    for (const child of [surface, outline, links]) {
      if (!child) continue;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    group.clear();
    surface = outline = links = undefined;
    source = selectedFace = undefined;
    vertices = [];
  };
  return {
    surfaces: () => (surface ? [surface] : []),
    update(data: BodyMesh, face: CadFace, target: FaceTarget, distance: number, visible: boolean) {
      if (source !== data || selectedFace !== face) {
        clear();
        source = data;
        selectedFace = face;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
        const indices = data.triangles.slice(face.start, face.start + face.count);
        geometry.setIndex(indices);
        surface = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: faceColors.tool,
            toneMapped: false,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
          }),
        );
        surface.userData.orbitSurface = true;
        outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: '#0069c8', depthTest: false }),
        );
        vertices = [...new Set(indices)].flatMap((i) => data.vertices.slice(i * 3, i * 3 + 3));
        const positions = new THREE.Float32BufferAttribute(
          new Float32Array(vertices.length * 2),
          3,
        );
        positions.setUsage(THREE.DynamicDrawUsage);
        links = new THREE.LineSegments(
          new THREE.BufferGeometry().setAttribute('position', positions),
          new THREE.LineBasicMaterial({ color: '#0069c8', depthTest: false }),
        );
        group.add(surface, outline, links);
      }
      surface!.position.set(...target.normal).multiplyScalar(distance);
      surface!.visible = visible;
      outline!.position.copy(surface!.position);
      const position = links!.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < vertices.length; i += 3) {
        position.setXYZ((i / 3) * 2, vertices[i], vertices[i + 1], vertices[i + 2]);
        position.setXYZ(
          (i / 3) * 2 + 1,
          vertices[i] + target.normal[0] * distance,
          vertices[i + 1] + target.normal[1] * distance,
          vertices[i + 2] + target.normal[2] * distance,
        );
      }
      position.needsUpdate = true;
      links!.geometry.computeBoundingSphere();
    },
    clear,
    dispose() {
      clear();
      scene.remove(group);
    },
  };
}
