import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createSunLighting,
  imageToneMapping,
  lightingPresets,
  sunDefaults,
  sunDirection,
  studioOffsets,
  aimLight,
  setTraceShadows,
  type TraceMaterial,
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

it('preserves legacy studio placement and supports exact overhead lighting at any azimuth', () => {
  expect(studioOffsets(0).map((p) => p.toArray())).toEqual([
    [-1, -0.8, 1.8],
    [1, 1, 1],
  ]);
  const distances = studioOffsets(0).map((p) => p.length());
  const center = new THREE.Vector3(4500, -7300, 1700);
  const sun = createSunLighting(new THREE.Scene());
  for (const rotation of [0, 90, 225, 360]) {
    for (const elevation of [0, 45, 89, 90]) {
      studioOffsets(rotation, elevation).forEach((p, i) => {
        expect(p.length()).toBeCloseTo(distances[i], 10);
        expect(p.clone().normalize().z).toBeCloseTo(Math.sin((elevation * Math.PI) / 180), 10);
        const panel = new THREE.RectAreaLight();
        panel.position.copy(p).multiplyScalar(2000).add(center);
        aimLight(panel, center);
        expect(
          new THREE.Vector3(0, 0, -1)
            .applyQuaternion(panel.quaternion)
            .distanceTo(p.clone().normalize().negate()),
        ).toBeLessThan(1e-10);
      });
    }
    sun.update({ ...sunDefaults, enabled: true, azimuth: rotation, elevation: 90 }, center, 2000);
    expect(
      sun.traced.position
        .clone()
        .sub(center)
        .normalize()
        .distanceTo(new THREE.Vector3(0, 0, 1)),
    ).toBeLessThan(1e-10);
    expect(
      new THREE.Vector3(0, 0, -1)
        .applyQuaternion(sun.traced.quaternion)
        .distanceTo(new THREE.Vector3(0, 0, -1)),
    ).toBeLessThan(1e-10);
  }
  sun.dispose();
});

it('disables traced shadow casting without hiding surfaces, including multi-material meshes and exports', () => {
  const scene = new THREE.Scene();
  const materials: TraceMaterial[] = [
    new THREE.MeshPhysicalMaterial(),
    new THREE.MeshStandardMaterial(),
  ];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials);
  scene.add(mesh);
  expect(setTraceShadows(scene, false)).toBe(true);
  expect(setTraceShadows(scene, false)).toBe(false);
  expect(materials.every((m) => m.castShadow === false && m.visible && m.opacity === 1)).toBe(true);
  expect(mesh.visible).toBe(true);
  const captured = captureRenderScene(scene, new THREE.PerspectiveCamera(), 1, 1);
  expect(setTraceShadows(scene, true)).toBe(true);
  const copy = captured.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, TraceMaterial[]>;
  expect(copy.material.every((m) => m.castShadow === false)).toBe(true);
  expect(materials.every((m) => m.castShadow)).toBe(true);
  captured.dispose();
  mesh.geometry.dispose();
  materials.forEach((m) => m.dispose());
});

it('saves overhead studio and sun settings, but rejects angles beyond the zenith', () => {
  const project = freshProject();
  project.settings.render = {
    environment: 'studio',
    exposure: 1,
    shadows: false,
    lightElevation: 90,
    lightPower: 0,
    environmentPower: 0,
    sun: { ...sunDefaults, enabled: true, elevation: 90 },
  };
  expect(parseProject(JSON.stringify(project)).settings.render).toEqual(project.settings.render);
  for (const invalid of [-1, 91, Infinity]) {
    project.settings.render.lightElevation = invalid;
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  }
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
