import { expect, it } from 'vitest';
import * as THREE from 'three';
import { freshProject, parseProject } from '../model/project';
import { imageLook, stylizedLook } from './imageLook';
import { captureRenderScene } from './snapshot';
import { imageToneMapping } from './lighting';

it('preserves legacy rendering and round-trips optional looks without changing materials or lights', () => {
  const project = freshProject();
  project.settings.render = { environment: 'studio', shadows: true, exposure: 1 };
  expect(parseProject(JSON.stringify(project)).settings.render).toEqual(project.settings.render);
  for (const look of ['standard', 'filmic', 'soft', 'dream', 'mist'] as const) {
    project.settings.render = { ...project.settings.render, look, lookStrength: 0.7 };
    const loaded = parseProject(JSON.stringify(project));
    expect(loaded.settings.render).toEqual(project.settings.render);
    expect(loaded.bodies).toEqual(project.bodies);
  }
  for (const amount of [-1, 1.01, Infinity]) {
    project.settings.render.lookStrength = amount;
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  }
  expect(stylizedLook({})).toBe(false);
  expect(stylizedLook({ look: 'filmic' })).toBe(false);
  expect(stylizedLook({ look: 'dream', lookStrength: 0 })).toBe(false);
  expect(imageToneMapping(undefined)).toBe(THREE.ACESFilmicToneMapping);
});

it('freezes the style of a background image and can bypass all effects again', () => {
  const settings = { look: 'dream' as const, lookStrength: 0.7 };
  const snapshot = captureRenderScene(
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    1.5,
    1,
    imageToneMapping(settings.look),
    settings,
  );
  const effect = imageLook(settings);
  settings.lookStrength = 0;
  expect(snapshot.look).toEqual({ look: 'dream', lookStrength: 0.7 });
  expect(effect.active).toBe(true);
  effect.configure(settings);
  expect(effect.active).toBe(false);
  effect.dispose();
  snapshot.dispose();
});
