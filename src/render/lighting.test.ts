import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createSunLighting,
  imageToneMapping,
  lightingPresets,
  sunDefaults,
  sunDirection,
} from './lighting';
import { freshProject, parseProject } from '../model/project';
import { captureRenderScene } from './snapshot';

it('uses a Z-up compass and points both renderers toward the same model centre', () => {
  expect(sunDirection(0, 0).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-10);
  expect(sunDirection(90, 0).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-10);
  const scene = new THREE.Scene(),
    sun = createSunLighting(scene),
    center = new THREE.Vector3(2300, -950, 475);
  sun.update({ ...sunDefaults, enabled: true, azimuth: 215, elevation: 25 }, center, 2000);
  const direction = sun.preview.position.clone().sub(center).normalize();
  expect(direction.distanceTo(sun.traced.position.clone().sub(center).normalize())).toBeLessThan(
    1e-10,
  );
  expect(
    new THREE.Vector3(0, 0, -1)
      .applyQuaternion(sun.traced.quaternion)
      .distanceTo(direction.negate()),
  ).toBeLessThan(1e-10);
  expect(sun.preview.target.position).toEqual(center);
  expect(sun.preview.visible).toBe(true);
  sun.update(undefined, center, 2000);
  expect(sun.preview.visible).toBe(false);
  expect(sun.traced.intensity).toBe(0);
  sun.dispose();
});

it('preserves incident power when solar softness or the model size changes', () => {
  const sun = createSunLighting(new THREE.Scene()),
    center = new THREE.Vector3();
  for (const extent of [100, 3000, 50000]) {
    for (const softness of [0.1, 0.53, 10]) {
      sun.update({ ...sunDefaults, enabled: true, power: 1.7, softness }, center, extent);
      const incident =
        (sun.traced.intensity * sun.traced.width * sun.traced.height) /
        sun.traced.position.distanceToSquared(center);
      expect(incident).toBeCloseTo(sun.preview.intensity, 10);
      expect(sun.preview.shadow.camera.far).toBeGreaterThan(sun.preview.position.length());
    }
  }
  sun.dispose();
});

it('freezes filmic display and solar lighting into an independent export', () => {
  const scene = new THREE.Scene(),
    sun = createSunLighting(scene),
    center = new THREE.Vector3();
  sun.update({ ...sunDefaults, enabled: true }, center, 1000);
  const snapshot = captureRenderScene(
    scene,
    new THREE.PerspectiveCamera(),
    1.5,
    1.2,
    imageToneMapping('filmic'),
  );
  const lights: THREE.Light[] = [];
  snapshot.scene.traverseVisible((o) => {
    if ((o as THREE.Light).isLight) lights.push(o as THREE.Light);
  });
  expect(lights).toHaveLength(1);
  expect(lights[0]).toBeInstanceOf(THREE.RectAreaLight);
  expect(lights[0]).not.toBe(sun.traced);
  const intensity = lights[0].intensity;
  sun.update(undefined, center, 1000);
  expect(lights[0].intensity).toBe(intensity);
  expect(snapshot.toneMapping).toBe(THREE.AgXToneMapping);
  expect(imageToneMapping(undefined)).toBe(THREE.ACESFilmicToneMapping);
  snapshot.dispose();
  sun.dispose();
});

it('round-trips lighting presets and retains the appearance of legacy projects', () => {
  const project = freshProject();
  project.settings.render = { environment: 'warm', exposure: 1.1, shadows: true };
  expect(parseProject(JSON.stringify(project)).settings.render).toEqual(project.settings.render);
  for (const preset of lightingPresets) {
    project.settings.render = { ...project.settings.render!, ...preset.settings, look: 'filmic' };
    expect(parseProject(JSON.stringify(project)).settings.render).toEqual(project.settings.render);
  }
  project.settings.render!.sun!.softness = 0;
  expect(() => parseProject(JSON.stringify(project))).toThrow();
});
