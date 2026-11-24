import { Mesh, MeshPhysicalMaterial, type Object3D } from 'three';

type OpticalState = Pick<
  MeshPhysicalMaterial,
  'transmission' | 'transparent' | 'opacity' | 'depthWrite' | 'forceSinglePass'
>;

/** Model viewport only. Keep the original maps, clipping, tint and material identity. */
export function createNavigationGlass(scene: Object3D, redraw: () => void) {
  let materials: Set<MeshPhysicalMaterial> | undefined;
  const original = new Map<MeshPhysicalMaterial, OpticalState>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const restore = () => {
    for (const [material, state] of original) Object.assign(material, state);
    original.clear();
  };
  const finish = () => {
    clearTimeout(timer);
    timer = undefined;
    restore();
  };
  return {
    cameraChanged() {
      if (materials?.size === 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const needsRedraw = original.size > 0;
        finish();
        if (needsRedraw) redraw();
      }, 180);
    },
    prepareFrame() {
      if (timer === undefined || original.size) return;
      if (!materials) {
        const found = new Set<MeshPhysicalMaterial>();
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
            if (m instanceof MeshPhysicalMaterial && m.transmission > 0 && m.visible) found.add(m);
          }
        });
        materials = found;
      }
      for (const m of materials) {
        const { transmission, transparent, opacity, depthWrite, forceSinglePass } = m;
        original.set(m, { transmission, transparent, opacity, depthWrite, forceSinglePass });
        // Alpha approximates transmitted light without rendering the background a second time.
        m.transmission = 0;
        m.transparent = true;
        m.opacity = opacity * (1 - 0.86 * transmission);
        m.depthWrite = false;
        m.forceSinglePass = true;
      }
    },
    // Restore before geometry or instance batches reuse/copy a material.
    invalidate() {
      restore();
      materials = undefined;
    },
    finish,
  };
}
