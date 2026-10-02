import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import { makeBody, freshProject, parseProject, type Guide } from '../model/project';
import { rotateBodies } from './transforms';
import { createShape, meshBody } from './kernel';
import { resolveAnchor, guidePoints } from '../model/guides';
import { applyRotation, moveToOrigin, rotatePoint, bodyVisible } from '../model/transforms';
import { Vector3 } from 'three';
import { textureFrameMatrix } from '../render/materials';
import { defaultAppearance } from '../model/materials';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
describe('rigid transforms and object organization', () => {
  it('keeps the texture fixed to the same material point through arbitrary and repeated rotations', () => {
    const body = {
      ...makeBody(100, 60, 20, [50, 80, 10]),
      appearance: defaultAppearance('oak'),
    };
    const local = new Vector3(31, 17, 8),
      pivot: [number, number, number] = [12, 8, -9],
      axis: [number, number, number] = [1, 2, 3];
    const world = local.clone().applyMatrix4(textureFrameMatrix(body));
    const first = rotateBodies([body], pivot, axis, 37)[0];
    const expected = new Vector3(...rotatePoint(world.toArray(), pivot, axis, 37));
    expect(local.clone().applyMatrix4(textureFrameMatrix(first)).distanceTo(expected)).toBeLessThan(
      1e-7,
    );
    const second = rotateBodies([first], [0, 0, 0], [0, 1, 0], -63)[0];
    const expectedAgain = new Vector3(
      ...rotatePoint(expected.toArray(), [0, 0, 0], [0, 1, 0], -63),
    );
    expect(
      local.clone().applyMatrix4(textureFrameMatrix(second)).distanceTo(expectedAgain),
    ).toBeLessThan(1e-7);
    expect(second.appearance).toEqual(body.appearance);
    expect(
      parseProject(JSON.stringify({ ...freshProject(), bodies: [second] })).bodies[0].textureFrame,
    ).toEqual(second.textureFrame);
  });
  it('rotates exact geometry about an edge, retaining volume, vertex/guide identities and reverse rotation', () => {
    const body = makeBody(100, 60, 20, [50, 80, 10]);
    const shape = createShape(body),
      mesh = meshBody(body, shape);
    shape.delete();
    const rotation = {
      ids: [body.id],
      pivot: [50, 80, 10] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 90,
    };
    const rotated = rotateBodies([body], rotation.pivot, rotation.axis, rotation.angle)[0];
    expect(rotated.origin[0]).toBeCloseTo(-10, 6);
    expect(rotated.origin[1]).toBeCloseTo(80, 6);
    expect(rotated.feature.width).toBeCloseTo(60, 6);
    expect(rotated.feature.depth).toBeCloseTo(100, 6);
    for (const vertex of mesh.verticesCAD) {
      const expected = rotatePoint(vertex.point, rotation.pivot, rotation.axis, 90);
      resolveAnchor([rotated], vertex.anchor)!.forEach((n, i) =>
        expect(n).toBeCloseTo(expected[i], 6),
      );
    }
    const edge = mesh.edgesCAD[0];
    const guide: Guide = {
      id: 'attached',
      mode: 'guide',
      anchor: { edge: { from: edge.from, to: edge.to, t: 0.3 } },
      plane: 'XY',
      length: 50,
      angle: 0,
      direction: [1, 0, 0],
      offset: [0, 12, 0],
    };
    const originalPoints = guidePoints([body], guide)!;
    const project = applyRotation(
      { ...freshProject(), bodies: [body], guides: [guide] },
      [rotated],
      rotation,
    );
    guidePoints(project.bodies, project.guides[0])!.forEach((p, i) =>
      p.forEach((n, axis) =>
        expect(n).toBeCloseTo(
          rotatePoint(originalPoints[i], rotation.pivot, rotation.axis, 90)[axis],
          6,
        ),
      ),
    );
    const restored = rotateBodies([rotated], rotation.pivot, rotation.axis, -90)[0];
    restored.origin.forEach((n, i) => expect(n).toBeCloseTo(body.origin[i], 6));
    const result = createShape(restored);
    expect(measureVolume(result.asShape3D())).toBeCloseTo(120000, 5);
    result.delete();
    expect(parseProject(JSON.stringify(project)).bodies[0]).toEqual(rotated);
  });
  it('rotates multiple bodies around a common arbitrary axis and rejects a held member atomically', () => {
    const a = makeBody(20, 30, 40, [100, 20, -50]),
      b = makeBody(20, 30, 40, [300, 70, 20]);
    const rotated = rotateBodies([a, b], [12, 8, 3], [1, 1, 1], -32.5);
    for (const body of rotated) {
      const shape = createShape(body);
      expect(measureVolume(shape.asShape3D())).toBeCloseTo(24000, 5);
      shape.delete();
    }
    expect(() => rotateBodies([a, { ...b, locked: true }], [0, 0, 0], [0, 0, 1], 90)).toThrow(
      /kiinnitetty/,
    );
    expect(a.origin).toEqual([100, 20, -50]);
  });
  it('moves a selection to the origin without changing relative positions and honors locking', () => {
    const a = makeBody(100, 60, 20, [200, 300, 40]),
      b = makeBody(50, 50, 50, [400, 500, 40]);
    const project = { ...freshProject(), bodies: [a, b] };
    const lower = moveToOrigin(project, [a.id, b.id], 'min');
    expect(lower.bodies.map((b) => b.origin)).toEqual([
      [0, 0, 0],
      [200, 200, 0],
    ]);
    const center = moveToOrigin(project, [a.id], 'center');
    expect(center.bodies[0].origin).toEqual([-50, -30, -10]);
    expect(center.bodies[1]).toEqual(b);
    expect(() =>
      moveToOrigin({ ...project, bodies: [{ ...a, locked: true }, b] }, [a.id, b.id], 'min'),
    ).toThrow(/kiinnitetty/);
  });
  it('migrates legacy files and round-trips named groups, held/hidden bodies and subtle axes', () => {
    const legacy = {
      ...freshProject(),
      version: 4,
      bodies: [makeBody()],
      settings: { guideXray: false },
    };
    const migrated = parseProject(JSON.stringify(legacy));
    expect(migrated.version).toBe(6);
    expect(migrated.groups).toEqual([]);
    expect(migrated.settings.axisStyle).toBe('subtle');
    expect(migrated.settings.axisLabels).toBe(false);
    const project = {
      ...migrated,
      groups: [{ id: 'walls', name: 'Seinät', hidden: true }],
      bodies: [{ ...migrated.bodies[0], groupId: 'walls', locked: true }],
    };
    const roundtrip = parseProject(JSON.stringify(project));
    expect(roundtrip).toEqual(project);
    expect(bodyVisible(roundtrip.bodies[0], roundtrip.groups)).toBe(false);
    expect(() => parseProject(JSON.stringify({ ...project, groups: [] }))).toThrow();
  });
});
