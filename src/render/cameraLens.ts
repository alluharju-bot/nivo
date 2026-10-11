import type { PerspectiveCamera } from 'three';

export const defaultFocalLength = 35;
/** A 36 mm film gate, cropped to the viewport. Position and target never change. */
export function setCameraLens(camera: PerspectiveCamera, focalLength = defaultFocalLength) {
  camera.filmGauge = 36;
  camera.setFocalLength(focalLength);
}
