import { expect, it } from 'vitest';
import * as THREE from 'three';
import { freshProject, makeBody, projectSchema } from './project';
import { defaultAppearance } from './materials';
import { asComponent, synchronizeComponents } from './components';
import { varyTextures, woodGrainRotation } from './textureVariation';

it('varies 100 linked instances without moving them, changing maps or affecting an unselected copy', async () => {
  const source = asComponent({
    ...makeBody(2400, 95, 19),
    appearance: { ...defaultAppearance('pine'), bumpDepth: 0.3, roughness: 0.23 },
  });
  const bodies = Array.from({ length: 101 }, (_, i) => ({
    ...source,
    id: `panel-${i}`,
    origin: [0, i * 100, 0] as [number, number, number],
  }));
  const project = { ...freshProject(), bodies };
  const ids = bodies.slice(0, 100).map((b) => b.id);
  const options = { spread: 0.2, rotation: 0, alignWood: true };
  const result = varyTextures(project, ids, options, 917);
  expect(varyTextures(project, ids, options, 917)).toEqual(result);
  expect(new Set(result.bodies.slice(0, 100).map((b) => b.appearance!.texture.offsetY)).size).toBe(
    100,
  );
  for (const [i, body] of result.bodies.slice(0, 100).entries()) {
    expect(body.feature).toBe(bodies[i].feature);
    expect(body.origin).toBe(bodies[i].origin);
    expect(body.component).toBe(bodies[i].component);
    expect(body.localTexture).toBe(true);
    expect(body.localMaterial).toBeUndefined();
    expect(body.appearance).toEqual({
      ...source.appearance,
      texture: expect.objectContaining({
        width: source.appearance!.texture.width,
        height: source.appearance!.texture.height,
        rotation: 90,
      }),
    });
    expect(Math.abs(body.appearance!.texture.offsetX)).toBeLessThanOrEqual(
      source.appearance!.texture.width * 0.2,
    );
    expect(Math.abs(body.appearance!.texture.offsetY)).toBeLessThanOrEqual(
      source.appearance!.texture.height * 0.2,
    );
  }
  expect(result.bodies[100]).toBe(bodies[100]);
  expect(
    await synchronizeComponents(project, result, async () => {
      throw new Error('Geometry must not be rebuilt');
    }),
  ).toEqual(result);
  expect(projectSchema.safeParse(result).success).toBe(true);
});

it('finds the long grain on the broad face and follows rotated part coordinates', () => {
  expect(woodGrainRotation(makeBody(2400, 95, 19))).toBe(90);
  expect(woodGrainRotation(makeBody(95, 2400, 19))).toBe(0);
  expect(woodGrainRotation(makeBody(19, 2400, 95))).toBe(90);
  expect(woodGrainRotation(makeBody(95, 19, 2400))).toBe(0);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const body = {
    ...makeBody(95, 2400, 19),
    textureFrame: {
      offset: [2400, 0, 0] as [number, number, number],
      rotation: rotation.toArray() as [number, number, number, number],
    },
  };
  const vertices: number[] = [];
  for (const x of [0, 2400])
    for (const y of [0, 95])
      for (const z of [0, 19])
        vertices.push(
          ...new THREE.Vector3(x, y, z)
            .applyQuaternion(rotation)
            .add(new THREE.Vector3(2400, 0, 0))
            .toArray(),
        );
  expect(woodGrainRotation(body, { vertices })).toBe(90);
});

it('keeps tiles and custom rotations, respects Hold and handles placement limits', () => {
  const body = { ...makeBody(400, 600, 20), appearance: defaultAppearance('pine') };
  body.appearance.texture = {
    ...body.appearance.texture,
    rotation: 33,
    offsetX: 99999,
    offsetY: -99999,
  };
  const plain = makeBody(50, 50, 50);
  const project = { ...freshProject(), bodies: [body, plain] };
  const next = varyTextures(
    project,
    [body.id, plain.id],
    { spread: 1, rotation: 0, alignWood: false },
    77,
  );
  expect(next.bodies[0].appearance!.texture.rotation).toBe(33);
  expect(next.bodies[1]).toBe(plain);
  expect(projectSchema.safeParse(next).success).toBe(true);
  expect(() =>
    varyTextures(
      { ...project, bodies: [{ ...body, locked: true }] },
      [body.id],
      { spread: 0.2, rotation: 0, alignWood: true },
      1,
    ),
  ).toThrow('Hold');
  const tile = {
    ...body,
    appearance: {
      ...defaultAppearance('tile-white-gloss'),
      texture: { ...body.appearance.texture, rotation: 27 },
    },
  };
  expect(
    varyTextures(
      { ...project, bodies: [tile] },
      [tile.id],
      { spread: 0.2, rotation: 0, alignWood: true },
      1,
    ).bodies[0].appearance!.texture.rotation,
  ).toBe(27);
});
