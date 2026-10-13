import * as THREE from 'three';

/** Short-lived x-ray overlay. Reuses model buffers and never enters the pick scene. */
export function createLocateHighlight(
  scene: THREE.Scene,
  canvas: HTMLCanvasElement,
  render: () => void,
) {
  const group = new THREE.Group();
  group.name = 'locate-highlight';
  scene.add(group);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    for (const object of group.children) {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => m.dispose());
      }
    }
    group.clear();
    canvas.dataset.locatedIds = '[]';
  };
  return {
    group,
    show(nodes: { id: string; mesh: THREE.Mesh; outline: THREE.LineSegments }[]) {
      clear();
      for (const node of nodes) {
        const surface = new THREE.Mesh(
          node.mesh.geometry,
          new THREE.MeshBasicMaterial({
            color: '#f5a23c',
            transparent: true,
            opacity: 0.32,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        const outline = new THREE.LineSegments(
          node.outline.geometry,
          new THREE.LineBasicMaterial({
            color: '#e77c12',
            depthTest: false,
            depthWrite: false,
          }),
        );
        for (const [object, source] of [
          [surface, node.mesh],
          [outline, node.outline],
        ]) {
          source.updateWorldMatrix(true, false);
          object.matrix.copy(source.matrixWorld);
          object.matrixAutoUpdate = false;
          object.renderOrder = 150;
          object.userData.sharedGeometry = true;
          group.add(object);
        }
      }
      canvas.dataset.locatedIds = JSON.stringify(nodes.map((n) => n.id));
      render();
      timer = setTimeout(() => {
        clear();
        render();
      }, 5000);
    },
    clear,
    dispose() {
      clear();
      scene.remove(group);
    },
  };
}
