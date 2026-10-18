import { expect, it } from 'vitest';
import { BoxGeometry, SphereGeometry, TorusGeometry } from 'three';
import { geometryPayload } from './exportScene';
import { simplifyExportMesh } from './lod';
import { meshClosure } from './mesh';
import { prepareGlbLods } from './export';

it('rejects invalid target ratios and accuracy before starting an export', async () => {
  for (const ratios of [
    [0.2, 0.5],
    [1, 0.2],
    [0.5, NaN],
    [0.5, 0],
  ] as [number, number][])
    await expect(prepareGlbLods([], [], {}, false, () => {}, undefined, ratios)).rejects.toThrow(
      'LOD2',
    );
  await expect(
    prepareGlbLods([], [], {}, false, () => {}, undefined, [0.5, 0.2], undefined, [NaN, 0.1]),
  ).rejects.toThrow('muotovirheen');
});

it('reduces a smooth surface while retaining finite normals, UVs and a closed shell', async () => {
  const g = new SphereGeometry(100, 48, 32);
  g.clearGroups();
  g.addGroup(0, g.index!.count, 0);
  const input = geometryPayload(g);
  const result = await simplifyExportMesh(input, 0.35, 0.01);
  expect(result.indices.length).toBeLessThan(input.indices.length * 0.7);
  expect(result.positions.length).toBeLessThan(input.positions.length);
  expect(meshClosure(result.positions, result.indices).closed).toBe(true);
  expect(result.normals.every(Number.isFinite)).toBe(true);
  expect(result.uv.length).toBe((result.positions.length / 3) * 2);
  g.dispose();
});
it('keeps a hole open and preserves material boundaries, even when targets cannot be met', async () => {
  const torus = new TorusGeometry(100, 20, 16, 64);
  torus.addGroup(0, torus.index!.count, 0);
  const result = await simplifyExportMesh(geometryPayload(torus), 0.2, 0.005);
  expect(meshClosure(result.positions, result.indices).closed).toBe(true);
  for (let i = 0; i < result.positions.length; i += 3)
    expect(Math.hypot(result.positions[i], result.positions[i + 1])).toBeGreaterThan(79);
  const box = new BoxGeometry(100, 100, 100, 5, 5, 5);
  const simplified = await simplifyExportMesh(geometryPayload(box), 0.1, 0.01);
  expect(simplified.groups).toHaveLength(6);
  expect(simplified.groups.every((g) => g.count > 0)).toBe(true);
  expect(meshClosure(simplified.positions, simplified.indices).closed).toBe(true);
  torus.dispose();
  box.dispose();
});
