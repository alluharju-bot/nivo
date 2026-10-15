import { Vector3, MathUtils, type PerspectiveCamera, type OrthographicCamera } from 'three';
import type { Vec3 } from '../model/project';

/** Keep controls usable on tiny parts and inside the view when examining a large part. */
export function viewHandleRadius(
  camera: PerspectiveCamera | OrthographicCamera,
  pivot: Vec3,
  height: number,
  modelRadius: number,
) {
  const extent =
    'isOrthographicCamera' in camera
      ? (camera.top - camera.bottom) / camera.zoom
      : (2 *
          Math.max(
            camera.near,
            Math.abs(new Vector3(...pivot).applyMatrix4(camera.matrixWorldInverse).z),
          ) *
          Math.tan(MathUtils.degToRad(camera.fov / 2))) /
        camera.zoom;
  const pixel = extent / Math.max(1, height);
  return MathUtils.clamp(
    modelRadius,
    pixel * 52,
    pixel * Math.max(52, Math.min(130, height * 0.22)),
  );
}
