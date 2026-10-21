import { beforeAll, expect, test } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { BoxGeometry, TorusGeometry, Vector3 } from 'three';
import { meshBounds, readGeometry, type SurfaceMesh } from '../surface/mesh';
import { meshClosure } from '../exchange/mesh';
import { fractureMesh } from './fracture';
import { impactCutter, impactDepth } from './impact';
import { createSimulation } from './physics';
import type { ImpactRegion } from './types';

let api: ManifoldToplevel;
beforeAll(async () => {
  api = await Module({
    locateFile: () =>
      new URL('../../node_modules/manifold-3d/manifold.wasm', import.meta.url).pathname,
  });
  api.setup();
});
function box(x = 0, y = 0, z = 0) {
  const geometry = new BoxGeometry(1000, 150, 2000).translate(x + 500, y + 75, z + 1000);
  const mesh = readGeometry(geometry);
  geometry.dispose();
  return mesh;
}
const impact: ImpactRegion = { point: [500, 0, 1000], normal: [0, -1, 0], diameter: 400 };
const options = { count: 8, seed: 42, irregularity: 0.8, ragged: true };
function verify(source: SurfaceMesh, region: ImpactRegion) {
  const result = fractureMesh(api, source, { ...options, impact: region });
  expect(result.fragments.filter((p) => !p.fixed)).toHaveLength(8);
  expect(result.fragments.filter((p) => p.fixed)).toHaveLength(1);
  expect(result.fragments.every((p) => meshClosure(p.mesh.positions, p.mesh.indices).closed)).toBe(
    true,
  );
  expect(result.fragments.reduce((n, p) => n + p.volume, 0) / result.sourceVolume).toBeCloseTo(
    1,
    5,
  );
  return result;
}
test('local impact creates a closed hole and only throws the struck wall region', async () => {
  const source = box();
  const preview = impactCutter(source, impact, 42, 0.8);
  expect(meshClosure(preview.positions, preview.indices).closed).toBe(true);
  expect(impactDepth(source, impact)).toBeCloseTo(150.02);
  const result = verify(source, impact);
  const remainder = result.fragments.find((p) => p.fixed)!;
  expect(meshBounds(remainder.mesh).size).toEqual([1000, 150, 2000]);
  expect(remainder.volume / result.sourceVolume).toBeGreaterThan(0.9);
  const sim = await createSimulation(result, [], undefined, 0, {
    direction: [0, 1, 0],
    speed: 2,
    spread: 0,
    gravity: [0, 0, 0],
  });
  const before = sim.poses();
  for (let i = 0; i < 120; i++) sim.step();
  const after = sim.poses();
  sim.dispose();
  after.forEach((pose, i) => {
    if (result.fragments[i].fixed) expect(pose).toEqual(before[i]);
    else expect(pose.position[1] - before[i].position[1]).toBeGreaterThan(1500);
  });
});
test('depth-limited damage leaves the back of the wall intact; edge impacts are clipped', () => {
  const result = verify(box(), { ...impact, depth: 40 });
  expect(
    result.fragments.filter((p) => !p.fixed).every((p) => meshBounds(p.mesh).max[1] <= 40.01),
  ).toBe(true);
  const edge = verify(box(), { ...impact, point: [30, 0, 1000] });
  expect(
    edge.fragments.filter((p) => !p.fixed).every((p) => meshBounds(p.mesh).min[0] >= -0.01),
  ).toBe(true);
});
test('through impact stops at the first wall even when the same part includes the opposite wall', () => {
  const first = box(),
    second = box(0, 1500);
  const source: SurfaceMesh = {
    positions: [...first.positions, ...second.positions],
    normals: [...first.normals, ...second.normals],
    indices: [...first.indices, ...second.indices.map((n) => n + first.positions.length / 3)],
    faces: [...first.faces, ...second.faces],
  };
  const result = verify(source, impact);
  expect(
    result.fragments.filter((p) => !p.fixed).every((p) => meshBounds(p.mesh).max[1] <= 150.01),
  ).toBe(true);
  const fixed = result.fragments.find((p) => p.fixed)!;
  expect(meshBounds(fixed.mesh).max[1]).toBe(1650);
});
test('impact handles rotated surfaces and negative coordinates without relying on world axes', () => {
  const geometry = new BoxGeometry(1000, 150, 2000)
    .translate(500, 75, 1000)
    .rotateZ(0.7)
    .translate(-2300, -4000, -3000);
  const mesh = readGeometry(geometry);
  geometry.dispose();
  const point = new Vector3(...impact.point)
    .applyAxisAngle(new Vector3(0, 0, 1), 0.7)
    .add(new Vector3(-2300, -4000, -3000))
    .toArray();
  const normal = new Vector3(...impact.normal).applyAxisAngle(new Vector3(0, 0, 1), 0.7).toArray();
  expect(impactDepth(mesh, { ...impact, point, normal })).toBeCloseTo(150.02, 2);
  verify(mesh, { ...impact, point, normal });
});
test('invalid impact options fail without producing replacement geometry', () => {
  expect(() => impactDepth(box(), { ...impact, depth: 0 })).toThrow();
  expect(() => impactDepth(box(), { ...impact, normal: [0, 0, 0] })).toThrow();
  expect(() => impactDepth(box(), { ...impact, point: [5000, 0, 1000] })).toThrow(/takapintaa/);
  expect(() =>
    fractureMesh(api, box(), { ...options, impact, region: { normal: [1, 0, 0], offset: 500 } }),
  ).toThrow(/yksi/);
});

test('a non-star-shaped hollow shard uses bounded convex decomposition without a WASM trap', async () => {
  const geometry = new TorusGeometry(150, 35, 8, 24);
  const mesh = readGeometry(geometry);
  geometry.dispose();
  const sim = await createSimulation(
    {
      sourceVolume: 1,
      interiorFace: 1,
      fragments: [{ mesh, fixed: false, convex: false, volume: 1 }],
    },
    [],
    undefined,
    0,
    { direction: [0, 1, 0], speed: 2, spread: 0, gravity: [0, 0, -9.81] },
  );
  try {
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.poses()[0].position[1]).toBeGreaterThan(1900);
    expect(sim.poses()[0].position[2]).toBeLessThan(-4000);
    expect(sim.poses()[0].position.every(Number.isFinite)).toBe(true);
  } finally {
    sim.dispose();
  }
}, 15000);
