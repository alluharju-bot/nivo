import { expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene } from 'three';
import { pointerRay } from './pointerRay';

it('shares reference queries but refreshes moved geometry on the next task, even with a stored event', async () => {
  const scene = new Scene();
  const box = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  scene.add(box);
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.z = 10;
  const ray = new Raycaster();
  const update = vi.spyOn(scene, 'updateMatrixWorld');
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect,
  };
  const setRay = pointerRay(canvas, scene, () => camera, ray);
  const event = { clientX: 50, clientY: 50 } as PointerEvent;
  for (let i = 0; i < 40; i++) setRay(event);
  expect(update).toHaveBeenCalledTimes(1);
  expect(ray.intersectObject(box).length).toBeGreaterThan(0);
  await Promise.resolve();
  box.position.x = 3;
  setRay(event);
  expect(update).toHaveBeenCalledTimes(2);
  expect(ray.intersectObject(box)).toEqual([]);
  // A camera focus or zoom inside the event also invalidates the ray.
  camera.position.x = 3;
  setRay(event);
  expect(ray.intersectObject(box).length).toBeGreaterThan(0);
  setRay({ ...event, clientX: 80 });
  expect(ray.intersectObject(box)).toEqual([]);
  const zoomEvent = { ...event, clientX: 80 };
  setRay(zoomEvent);
  camera.zoom = 10;
  camera.updateProjectionMatrix();
  setRay(zoomEvent);
  expect(ray.intersectObject(box).length).toBeGreaterThan(0);
  box.geometry.dispose();
  box.material.dispose();
});
