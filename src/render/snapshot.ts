import * as THREE from 'three';
import { omitPreviewLights } from './lights';
import { isTraceEnvironment } from './environment';
import type { TraceMaterial } from './lighting';

export type RenderSnapshot = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  aspect: number;
  exposure: number;
  toneMapping: THREE.ToneMapping;
  dispose: () => void;
};
/** Own the copied resources so a model edit or leaving Render cannot alter an in-flight image. */
export function captureRenderScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  aspect: number,
  exposure: number,
  toneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping,
): RenderSnapshot {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const snapshot = scene.clone(),
    resources = new Set<{ dispose: () => void }>();
  omitPreviewLights(snapshot);
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const copyTexture = (original: THREE.Texture) => {
    let texture = textures.get(original);
    if (!texture) {
      texture = original.clone();
      texture.needsUpdate = true;
      textures.set(original, texture);
      resources.add(texture);
    }
    return texture;
  };
  const omitted: THREE.Object3D[] = [];
  snapshot.traverse((object) => {
    if ((object as THREE.Sprite).isSprite || !(object as THREE.Mesh).isMesh) {
      if ((object as THREE.Sprite).isSprite) omitted.push(object);
      return;
    }
    const mesh = object as THREE.Mesh;
    mesh.geometry = mesh.geometry.clone();
    resources.add(mesh.geometry);
    const copyMaterial = (source: THREE.Material) => {
      const material = source.clone();
      // Three's copy() does not copy the path tracer's material extension.
      if (
        source instanceof THREE.MeshStandardMaterial &&
        material instanceof THREE.MeshStandardMaterial &&
        (source as TraceMaterial).castShadow !== undefined
      )
        (material as TraceMaterial).castShadow = (source as TraceMaterial).castShadow;
      resources.add(material);
      for (const [key, value] of Object.entries(material))
        if (value instanceof THREE.Texture)
          (material as unknown as Record<string, unknown>)[key] = copyTexture(value);
      return material;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(copyMaterial)
      : copyMaterial(mesh.material);
  });
  omitted.forEach((object) => object.removeFromParent());
  // Own the HDRI too; the job generates a fallback when only a raster PMREM exists.
  snapshot.environment = isTraceEnvironment(scene.environment)
    ? copyTexture(scene.environment)
    : null;
  if (snapshot.background instanceof THREE.Texture)
    snapshot.background = copyTexture(snapshot.background);
  let disposed = false;
  return {
    scene: snapshot,
    camera: camera.clone(),
    aspect,
    exposure,
    toneMapping,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resources.forEach((resource) => resource.dispose());
      snapshot.clear();
    },
  };
}
