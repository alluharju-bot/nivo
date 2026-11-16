import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Scene,
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  PerspectiveCamera,
  ACESFilmicToneMapping,
} from 'three';
import { parseProject } from '../model/project';
import {
  animationRenderPlan,
  animationRenderPosition,
  animationResolutions,
  poseAnimationFrame,
} from './animationRender';
import { prepareTraceMaterials } from './traceMaterials';

const options = {
  width: 1920,
  height: 1080,
  fps: 30,
  start: 0,
  end: 23,
  samples: 16384,
  denoise: true,
};
describe('offline camera animation', () => {
  it('does not double-count a saved frame while its previous progress report is still visible', () => {
    const progress = {
      phase: 'rendering' as const,
      frame: 0,
      samples: 1024,
      target: 1024,
      elapsed: 30,
      width: 1280,
      height: 720,
    };
    expect(animationRenderPosition(0, 10)).toBe(0);
    expect(animationRenderPosition(0, 10, { ...progress, samples: 512 })).toBe(0.5);
    expect(animationRenderPosition(1, 10, progress)).toBe(1);
    expect(animationRenderPosition(1, 10, { ...progress, phase: 'saving' })).toBe(1);
    expect(
      animationRenderPosition(1, 10, { ...progress, phase: 'preparing', frame: 1, samples: 0 }),
    ).toBe(1);
    expect(animationRenderPosition(1, 10, { ...progress, frame: 1, samples: 512 })).toBe(1.5);
    expect(animationRenderPosition(10, 10, { ...progress, frame: 9 })).toBe(10);
  });
  it('samples exact frame times, independent of render duration, without duplicating the endpoint', () => {
    const plan = animationRenderPlan(options, 23);
    expect(plan.frames).toBe(690);
    expect(plan.time(689)).toBeCloseTo(22.966666667);
    expect(animationRenderPlan({ ...options, start: 9, end: 9.1 }, 23).frames).toBe(3);
    expect(animationRenderPlan({ ...options, start: 9, end: 9.11 }, 23).frames).toBe(4);
  });
  it('accepts all native resolution presets and rejects invalid or unbounded jobs', () => {
    for (const resolution of animationResolutions)
      expect(animationRenderPlan({ ...options, ...resolution }, 23).frames).toBe(690);
    for (const patch of [
      { samples: 65537 },
      { samples: NaN },
      { bounces: 0 },
      { bounces: 17 },
      { bounces: NaN },
      { end: 24 },
      { start: 23 },
      { fps: 0 },
      { width: 8000 },
      { width: 1921 },
    ])
      expect(() => animationRenderPlan({ ...options, ...patch }, 23)).toThrow();
  });
  it('updates animated material groups and their attached lights with absolute poses', () => {
    const project = parseProject(readFileSync('public/examples/kamerakierros.nivo', 'utf8'));
    const data = project.animation!,
      clip = data.clips[0];
    const bodyId = data.nodes.find((n) => clip.tracks.some((t) => t.nodeId === n.id))!.bodyId!;
    const scene = new Scene(),
      geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(geometry, [material, material, material, material, material, material]);
    mesh.userData.bodyId = bodyId;
    scene.add(mesh);
    const lightGroup = new Group();
    lightGroup.userData.bodyId = bodyId;
    scene.add(lightGroup);
    const snapshot = {
      scene,
      camera: new PerspectiveCamera(),
      aspect: 16 / 9,
      exposure: 1,
      toneMapping: ACESFilmicToneMapping,
      dispose() {},
    };
    const release = prepareTraceMaterials(scene);
    try {
      poseAnimationFrame(snapshot, data, clip, 0);
      const original = lightGroup.matrix.clone();
      expect(poseAnimationFrame(snapshot, data, clip, 20)).toBe(true);
      expect(lightGroup.matrix.equals(original)).toBe(false);
      const atEnd = lightGroup.matrix.clone();
      expect(poseAnimationFrame(snapshot, data, clip, 20)).toBe(false);
      expect(lightGroup.matrix.equals(atEnd)).toBe(true);
      expect(
        scene.children
          .filter((o) => o.userData.bodyId === bodyId)
          .every((o) => o.matrix.equals(atEnd)),
      ).toBe(true);
      poseAnimationFrame(snapshot, data, clip, 0);
      expect(lightGroup.matrix.equals(original)).toBe(true);
      expect(snapshot.camera.aspect).toBe(16 / 9);
    } finally {
      release();
      geometry.dispose();
      material.dispose();
    }
  });
});
