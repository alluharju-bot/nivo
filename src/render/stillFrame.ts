import { Matrix4, type Camera } from 'three';

/** Only for a frozen export whose callback reports every scene change.
 * Exact matrices avoid reusing a subtly moving camera or an animated zoom. */
export function stillFrameTracker() {
  const world = new Matrix4(),
    projection = new Matrix4();
  let initialized = false;
  return (camera: Camera, sceneChanged: boolean) => {
    const same =
      initialized &&
      !sceneChanged &&
      world.equals(camera.matrixWorld) &&
      projection.equals(camera.projectionMatrix);
    world.copy(camera.matrixWorld);
    projection.copy(camera.projectionMatrix);
    initialized = true;
    return same;
  };
}
