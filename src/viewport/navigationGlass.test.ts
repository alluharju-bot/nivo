import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Mesh, MeshPhysicalMaterial, Scene } from 'three';
import { createNavigationGlass } from './navigationGlass';

afterEach(() => vi.useRealTimers());

it('uses transparent glass for moving whole parts, face slots and instances, then restores exact optics once', () => {
  vi.useFakeTimers();
  const scene = new Scene();
  const glass = new MeshPhysicalMaterial({ transmission: 0.98, opacity: 0.8 });
  const face = new MeshPhysicalMaterial({
    transmission: 0.4,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
  });
  const opaque = new MeshPhysicalMaterial();
  scene.add(
    new Mesh(new BoxGeometry(), [opaque, face]),
    new InstancedMesh(new BoxGeometry(), glass, 3),
  );
  const draw = vi.fn();
  const preview = createNavigationGlass(scene, draw);
  preview.cameraChanged();
  preview.prepareFrame();
  expect(glass.transmission).toBe(0);
  expect(glass.opacity).toBeGreaterThan(0);
  expect(glass.opacity).toBeLessThan(0.8);
  expect(face.transmission).toBe(0);
  expect(opaque.transparent).toBe(false);
  vi.advanceTimersByTime(120);
  preview.cameraChanged();
  preview.prepareFrame();
  vi.advanceTimersByTime(120);
  expect(draw).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60);
  expect(draw).toHaveBeenCalledOnce();
  expect(glass).toMatchObject({
    transmission: 0.98,
    opacity: 0.8,
    transparent: false,
    depthWrite: true,
    forceSinglePass: false,
  });
  expect(face).toMatchObject({
    transmission: 0.4,
    opacity: 1,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
  });
});

it('refreshes changed face materials during navigation and returns to full quality for an immediate capture', () => {
  vi.useFakeTimers();
  const scene = new Scene(),
    draw = vi.fn(),
    preview = createNavigationGlass(scene, draw);
  const mesh = new Mesh(new BoxGeometry(), new MeshPhysicalMaterial({ transmission: 0.7 }));
  scene.add(mesh);
  preview.cameraChanged();
  preview.prepareFrame();
  preview.invalidate();
  expect(mesh.material.transmission).toBe(0.7);
  mesh.material = new MeshPhysicalMaterial({ transmission: 0.9 });
  preview.prepareFrame();
  expect(mesh.material.transmission).toBe(0);
  preview.finish();
  preview.prepareFrame();
  expect(mesh.material.transmission).toBe(0.9);
  vi.runAllTimers();
  expect(draw).not.toHaveBeenCalled();
});
