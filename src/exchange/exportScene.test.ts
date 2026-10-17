import { expect, it } from 'vitest';
import { BoxGeometry, InstancedMesh, Mesh, Vector3 } from 'three';
import { makeBody, type Body } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { meshBody } from './mesh';
import { exportScene } from './exportScene';

function boxes() {
  const geometry = new BoxGeometry(80, 60, 40).translate(40, 30, 20);
  const bodies = [0, 200, 400].map((x, i): Body => ({
    ...makeBody(80, 60, 40, [x, 15, -10], `Osa ${i}`),
    material: 'matte',
    appearance: defaultAppearance('matte'),
    feature: {
      type: 'mesh',
      width: 80,
      depth: 60,
      height: 40,
      solid: true,
      vertices: Array.from(geometry.getAttribute('position').array),
      normals: Array.from(geometry.getAttribute('normal').array),
      triangles: Array.from(geometry.index!.array),
    },
  }));
  geometry.dispose();
  return bodies;
}
it('shares exact geometry and materials without removing individually named nodes or moving parts', async () => {
  const bodies = boxes(),
    source = JSON.stringify(bodies);
  const scene = await exportScene(bodies, bodies.map(meshBody), {});
  try {
    expect(scene.stats).toMatchObject({
      parts: 3,
      geometries: 1,
      materials: 1,
      triangles: 36,
      drawCalls: 3,
    });
    const objects = scene.root.children as Mesh[];
    expect(objects.map((m) => m.name)).toEqual(['Osa 0', 'Osa 1', 'Osa 2']);
    expect(objects[0].geometry).toBe(objects[1].geometry);
    const p = objects[1].localToWorld(new Vector3(0, 0, 0));
    expect(p.x).toBeCloseTo(0.2, 8);
    expect(p.y).toBeCloseTo(-0.01, 8);
    expect(p.z).toBeCloseTo(-0.015, 8);
    expect(JSON.stringify(bodies)).toBe(source);
  } finally {
    scene.release();
  }
});
it('only batches identical styles and keeps names/IDs mapped to GPU instances', async () => {
  const bodies = boxes();
  bodies[2].color = '#ff0000';
  const scene = await exportScene(bodies, bodies.map(meshBody), {}, { instances: true });
  try {
    expect(scene.stats).toMatchObject({ geometries: 1, materials: 2, triangles: 36, drawCalls: 2 });
    const batch = scene.root.children.find((m) => m instanceof InstancedMesh) as InstancedMesh;
    expect(batch.count).toBe(2);
    expect(batch.userData.nivoInstances.map((v: { id: string }) => v.id)).toEqual(
      bodies.slice(0, 2).map((b) => b.id),
    );
  } finally {
    scene.release();
  }
});
it('does not silently omit an unbuilt part', async () => {
  const bodies = boxes();
  await expect(exportScene(bodies, [meshBody(bodies[0])], {})).rejects.toThrow(
    'geometrian valmistumista',
  );
});
