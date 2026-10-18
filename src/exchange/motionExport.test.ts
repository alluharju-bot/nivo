import { expect, it } from 'vitest';
import { AnimationMixer, BoxGeometry, LoopOnce, Mesh, Vector3 } from 'three';
import { makeBody, type Body } from '../model/project';
import { defaultAppearance } from '../model/materials';
import type { Motion } from '../model/motion';
import { meshBody } from './mesh';
import { exportScene } from './exportScene';

function fixture() {
  const g = new BoxGeometry(100, 20, 100).translate(50, 10, 50);
  const bodies = [0, 200, 400, 600].map((x, i): Body => ({
    ...makeBody(100, 20, 100, [x, 50, 0], `Osa ${i}`),
    material: 'matte',
    appearance: defaultAppearance('matte'),
    feature: {
      type: 'mesh',
      width: 100,
      depth: 20,
      height: 100,
      solid: true,
      vertices: Array.from(g.getAttribute('position').array),
      normals: Array.from(g.getAttribute('normal').array),
      triangles: Array.from(g.index!.array),
    },
  }));
  g.dispose();
  const motion: Motion = {
    id: 'door-pivot',
    name: 'Ovi',
    kind: 'hinge',
    anchorId: bodies[0].id,
    movingIds: [bodies[1].id],
    pivot: [200, 0, 0],
    axis: [0, 0, 1],
    amount: 270,
    duration: 1,
    easing: 'smooth',
  };
  return { bodies, motion };
}
it('exports real named pivot nodes and clips, while preserving rest transforms and static instancing', async () => {
  const { bodies, motion } = fixture();
  const scene = await exportScene(
    bodies,
    bodies.map(meshBody),
    {},
    { motions: [motion], instances: true },
  );
  try {
    expect(scene.animations).toHaveLength(2);
    const pivot = scene.root.getObjectByName('pivot_door-pivot')!;
    expect(pivot.userData.nivoPivot).toMatchObject({
      id: motion.id,
      anchorId: bodies[0].id,
      movingIds: [bodies[1].id],
      closed: 0,
      open: 270,
    });
    const door = pivot.children[0] as Mesh;
    const rest = door.localToWorld(new Vector3(100, 0, 0));
    expect(rest.x).toBeCloseTo(0.3);
    expect(rest.y).toBeCloseTo(0);
    expect(rest.z).toBeCloseTo(-0.05);
    expect(door.userData.nivoMotion.role).toBe('moving');
    expect(scene.root.getObjectByName('Osa 0')!.userData.nivoAnchorFor).toEqual([motion.id]);
    const mixer = new AnimationMixer(scene.root);
    const opening = mixer.clipAction(scene.animations[0]);
    opening.setLoop(LoopOnce, 1);
    opening.clampWhenFinished = true;
    opening.play();
    mixer.update(1);
    scene.root.updateMatrixWorld(true);
    const end = door.localToWorld(new Vector3(100, 0, 0));
    expect(end.x).toBeCloseTo(0.2);
    expect(end.z).toBeCloseTo(0.05);
    opening.stop();
    const closing = mixer.clipAction(scene.animations[1]);
    closing.setLoop(LoopOnce, 1);
    closing.clampWhenFinished = true;
    closing.play();
    mixer.update(1);
    scene.root.updateMatrixWorld(true);
    expect(door.localToWorld(new Vector3(100, 0, 0)).distanceTo(rest)).toBeLessThan(1e-6);
    expect(scene.stats.parts).toBe(4);
  } finally {
    scene.release();
  }
});
it('exports independent slide clips and rejects incomplete animated selections', async () => {
  const { bodies, motion } = fixture();
  const slide = {
    ...motion,
    kind: 'slide' as const,
    axis: [0, -1, 0] as [number, number, number],
    amount: 300,
  };
  const scene = await exportScene(bodies, bodies.map(meshBody), {}, { motions: [slide] });
  try {
    expect(scene.animations[0].tracks[0].name).toMatch(/position$/);
    const values = scene.animations[0].tracks[0].values;
    expect(Array.from(values.slice(-3))).toEqual([200, -250, 0]);
  } finally {
    scene.release();
  }
  await expect(
    exportScene([bodies[1]], bodies.map(meshBody), {}, { motions: [motion] }),
  ).rejects.toThrow(/puuttuu/);
});
