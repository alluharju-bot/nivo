import { Matrix4, Vector2, type Camera, type Object3D, type Raycaster } from 'three';

/** Share one scene traversal across the reference queries of a synchronous pointer event. */
export function pointerRay(
  canvas: Pick<HTMLElement, 'getBoundingClientRect'>,
  scene: Object3D,
  camera: () => Camera,
  ray: Raycaster,
) {
  let lastEvent: PointerEvent | undefined;
  let lastCamera: Camera | undefined;
  const world = new Matrix4(),
    projection = new Matrix4(),
    pointer = new Vector2();
  return (event: PointerEvent) => {
    const view = camera();
    view.updateMatrixWorld();
    if (
      lastEvent === event &&
      lastCamera === view &&
      world.equals(view.matrixWorld) &&
      projection.equals(view.projectionMatrix)
    )
      return;
    // Key presses and camera navigation can reuse a stored pointer event later.
    // Never carry the scene snapshot into a later task or React update.
    if (!lastEvent)
      queueMicrotask(() => {
        lastEvent = undefined;
      });
    lastEvent = event;
    lastCamera = view;
    world.copy(view.matrixWorld);
    projection.copy(view.projectionMatrix);
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    scene.updateMatrixWorld();
    ray.setFromCamera(pointer, view);
  };
}
