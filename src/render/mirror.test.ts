import { expect, it } from 'vitest';
import * as THREE from 'three';
import { mirrorBacking, mirrorFaceGroups } from './mirror';
import { textureFrameMatrix } from './materials';
import { defaultAppearance } from '../model/materials';
import { freshProject, makeBody, parseProject } from '../model/project';

it('keeps the broad reflecting side attached to a rotated plate, including reload', () => {
  for (const side of ['front', 'back', 'both'] as const) {
    const body = {
      ...makeBody(600, 6, 900, [100, 200, 300]),
      appearance: { ...defaultAppearance('mirror'), mirrorSide: side },
      textureFrame: {
        offset: [0, 0, 0] as [number, number, number],
        rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.7, 0.9)).toArray(),
      },
    };
    const geometry = new THREE.BoxGeometry(600, 6, 900)
      .translate(300, 3, 450)
      .applyMatrix4(textureFrameMatrix(body));
    const groups = mirrorFaceGroups(geometry, body);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(36);
    expect(groups.filter((g) => g.reflective).reduce((sum, g) => sum + g.count, 0)).toBe(
      side === 'both' ? 12 : 6,
    );
    const inverse = textureFrameMatrix(body).invert();
    for (const group of groups.filter((g) => g.reflective)) {
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const normal = new THREE.Vector3()
          .fromBufferAttribute(geometry.getAttribute('normal'), geometry.index!.getX(i))
          .transformDirection(inverse);
        expect(side === 'both' ? Math.abs(normal.y) : normal.y).toBeCloseTo(
          side === 'front' ? -1 : 1,
          5,
        );
      }
    }
    const loaded = parseProject(JSON.stringify({ ...freshProject(), bodies: [body] }));
    expect(loaded.bodies[0].appearance?.mirrorSide).toBe(side);
    expect(mirrorFaceGroups(geometry, loaded.bodies[0])).toEqual(groups);
    geometry.dispose();
  }
});

it('gives the back and thin edges an opaque matte backing', () => {
  const material = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.005 });
  mirrorBacking(material);
  expect(material.metalness).toBe(0);
  expect(material.roughness).toBe(1);
  expect(material.clearcoat).toBe(0);
  expect(material.transmission).toBe(0);
  expect(material.userData.mirrorBacking).toBe(true);
  material.dispose();
});
