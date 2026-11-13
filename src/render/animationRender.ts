import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { AnimationClip, AnimationData } from '../model/animation';
import { evaluateAnimation } from '../model/animation';
import { evaluateCamera } from '../model/cameraAnimation';
import { setCameraLens } from './cameraLens';
import type { RenderSnapshot } from './snapshot';

export const animationResolutions = [
  { name: 'HD', width: 1280, height: 720 },
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: '2K DCI', width: 2048, height: 1080 },
  { name: 'QHD', width: 2560, height: 1440 },
  { name: '4K UHD', width: 3840, height: 2160 },
] as const;
export type AnimationRenderSettings = {
  width: number;
  height: number;
  fps: number;
  start: number;
  end: number;
  samples: number;
  denoise: boolean;
};
export function animationRenderPlan(settings: AnimationRenderSettings, duration: number) {
  const { width, height, fps, start, end, samples } = settings;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 12_000_000 ||
    width % 2 ||
    height % 2
  )
    throw new Error('Valitse tuettu, parillinen kuvakoko (enintään 4K).');
  if (![24, 25, 30, 60].includes(fps)) throw new Error('Kuvataajuus on 24, 25, 30 tai 60 fps.');
  if (
    ![start, end, duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > duration ||
    duration > 3600
  )
    throw new Error('Valitse klipin sisällä oleva aikaväli.');
  if (!Number.isInteger(samples) || samples < 1 || samples > 65536)
    throw new Error('Näytemäärän tulee olla 1–65536.');
  const frames = Math.ceil((end - start) * fps - 1e-8);
  return { frames, time: (index: number) => start + index / fps, duration: frames / fps };
}

/** Apply absolute poses to a private snapshot; never accumulate transforms.
 * Traversing also handles the material groups created by prepareTraceMaterials. */
export function poseAnimationFrame(
  snapshot: RenderSnapshot,
  data: AnimationData,
  clip: AnimationClip,
  time: number,
) {
  const pose = evaluateCamera(clip.camera, time);
  if (!pose || !(snapshot.camera instanceof PerspectiveCamera))
    throw new Error('Animaatio tarvitsee kamerareitin.');
  const camera = snapshot.camera;
  camera.aspect = snapshot.aspect;
  camera.position.set(...pose.position);
  camera.up.set(0, 0, 1);
  setCameraLens(camera, pose.focalLength);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const { bodyMatrices } = evaluateAnimation(data, clip, time),
    identity = new Matrix4();
  let changed = false;
  snapshot.scene.traverse((object) => {
    if (!object.userData.bodyId) return;
    const matrix = bodyMatrices.get(object.userData.bodyId) ?? identity;
    if (!object.matrix.equals(matrix)) {
      object.matrixAutoUpdate = false;
      object.matrix.copy(matrix);
      object.matrixWorldNeedsUpdate = true;
      changed = true;
    }
  });
  snapshot.scene.updateMatrixWorld(true);
  return changed;
}
