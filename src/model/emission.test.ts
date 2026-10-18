import { expect, it } from 'vitest';
import { changeEmission, emissionDirection } from './emission';
import { appearanceSchema, defaultAppearance, emissionSettings } from './materials';
import { makeBody, freshProject, parseProject } from './project';
import { paintSurface } from './faceMaterials';

it('edits light independently of body colour, texture and per-face finishes', () => {
  const initial = {
    ...makeBody(),
    color: '#667788',
    appearance: { ...defaultAppearance('oak'), roughness: 0.3 },
  };
  const body = paintSurface(initial, defaultAppearance('iron-black'), '#333333', 2);
  const result = changeEmission(body, { enabled: true, type: 'spot', angle: 48 });
  expect(result.faceMaterials).toBe(body.faceMaterials);
  expect(result.color).toBe(body.color);
  expect(result.appearance).toMatchObject({
    preset: 'oak',
    roughness: 0.3,
    texture: body.appearance!.texture,
  });
  const face = changeEmission(result, { enabled: true, intensity: 22 }, 2);
  expect(face.appearance).toBe(result.appearance);
  expect(face.faceMaterials?.[2]).toMatchObject({
    color: '#333333',
    appearance: { preset: 'iron-black', emission: { intensity: 22 } },
  });
  const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [face] }));
  expect(restored.bodies[0]).toEqual(face);
});

it('roundtrips a custom local light direction and clears it when choosing an axis', () => {
  const body = changeEmission(makeBody(), { enabled: true, type: 'spot', aim: [0.6, 0, -0.8] });
  expect(emissionDirection(body.appearance!.emission!)).toEqual([0.6, 0, -0.8]);
  const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [body] }));
  expect(restored.bodies[0].appearance?.emission?.aim).toEqual([0.6, 0, -0.8]);
  const axis = changeEmission(body, { direction: '-y', aim: undefined });
  expect(emissionDirection(axis.appearance!.emission!)).toEqual([0, -1, 0]);
  for (const aim of [
    [0, 0, 0],
    [Infinity, 0, 1],
    [100, 0, 1],
  ]) {
    expect(
      appearanceSchema.safeParse({
        ...body.appearance,
        emission: { ...body.appearance!.emission, aim },
      }).success,
    ).toBe(false);
  }
  expect(emissionDirection(emissionSettings(defaultAppearance('matte'), '#ffffff'))).toEqual([
    0, 0, -1,
  ]);
});
