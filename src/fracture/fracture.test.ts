import { beforeAll, describe, expect, test } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { BoxGeometry, PlaneGeometry, TorusGeometry, Vector3 } from 'three';
import { readGeometry, meshBounds } from '../surface/mesh';
import { meshClosure } from '../exchange/mesh';
import { bodySchema, freshProject, makeBody, projectSchema } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { fractureMesh } from './fracture';
import { createSimulation } from './physics';
import { fragmentBodies, insertFragments, restPoses } from './project';

let api: ManifoldToplevel;
beforeAll(async () => {
  api = await Module({
    locateFile: () =>
      new URL('../../node_modules/manifold-3d/manifold.wasm', import.meta.url).pathname,
  });
  api.setup();
});
const block = () => {
  const g = new BoxGeometry(1000, 200, 2000).translate(500, 100, 1000);
  const mesh = readGeometry(g);
  g.dispose();
  // Distinct exterior faces and UVs must survive newly generated cut faces.
  mesh.faces = mesh.faces.map((_, i) => Math.floor(i / 2));
  return mesh;
};
const options = { count: 12, seed: 47, irregularity: 0.8 };

describe('closed-volume fracture', () => {
  test('deterministic closed fragments conserve volume and retain original UV/material identities', () => {
    const source = block(),
      result = fractureMesh(api, source, options);
    expect(result.fragments).toHaveLength(12);
    expect(result.sourceVolume).toBeCloseTo(1000 * 200 * 2000, 0);
    expect(result.fragments.reduce((v, f) => v + f.volume, 0)).toBeCloseTo(result.sourceVolume, 0);
    expect(
      result.fragments.every((p) => meshClosure(p.mesh.positions, p.mesh.indices).closed),
    ).toBe(true);
    expect(result.fragments.some((p) => p.mesh.faces.includes(result.interiorFace))).toBe(true);
    for (const face of source.faces)
      expect(result.fragments.some((p) => p.mesh.faces.includes(face))).toBe(true);
    expect(
      result.fragments.every((p) => p.mesh.uv?.length === (p.mesh.positions.length / 3) * 2),
    ).toBe(true);
    expect(fractureMesh(api, source, options).fragments).toEqual(result.fragments);
    expect(fractureMesh(api, source, { ...options, seed: 48 }).fragments).not.toEqual(
      result.fragments,
    );
  });
  test('local end damage leaves a capped, unmoved remainder and can discard loose rubble', () => {
    const result = fractureMesh(api, block(), {
      ...options,
      region: { normal: [1, 0, 0], offset: 750 },
    });
    const fixed = result.fragments.filter((p) => p.fixed);
    expect(fixed).toHaveLength(1);
    expect(meshBounds(fixed[0].mesh).max[0]).toBeCloseTo(750);
    expect(fixed[0].volume / result.sourceVolume).toBeCloseTo(0.75);
    expect(
      result.fragments.filter((p) => !p.fixed).every((p) => meshBounds(p.mesh).min[0] >= 749.99),
    ).toBe(true);
    const bodies = fragmentBodies(
      makeBody(1000, 200, 2000),
      result,
      restPoses(result),
      '#999999',
      false,
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0].feature.type === 'mesh' && bodies[0].feature.solid).toBe(true);
  });
  test('a curved volume with a through hole is partitioned without filling the hole', () => {
    const g = new TorusGeometry(150, 35, 12, 32);
    const input = readGeometry(g);
    g.dispose();
    const result = fractureMesh(api, input, { ...options, count: 8 });
    expect(
      result.fragments.every((p) => meshClosure(p.mesh.positions, p.mesh.indices).closed),
    ).toBe(true);
    expect(result.fragments.reduce((v, f) => v + f.volume, 0) / result.sourceVolume).toBeCloseTo(
      1,
      5,
    );
    expect(
      result.fragments.every((p) =>
        p.mesh.positions.every((_, i, all) => i % 3 || Math.hypot(all[i], all[i + 1]) > 110),
      ),
    ).toBe(true);
  });
  test('a ragged end retains attached shards, rather than leaving only a flat saw cut', () => {
    const result = fractureMesh(api, block(), {
      ...options,
      ragged: true,
      region: { normal: [1, 0, 0], offset: 750 },
    });
    const fixed = result.fragments.find((p) => p.fixed)!;
    expect(fixed.volume / result.sourceVolume).toBeGreaterThan(0.75);
    expect(fixed.volume / result.sourceVolume).toBeLessThan(0.95);
    expect(meshBounds(fixed.mesh).max[0]).toBeGreaterThan(750);
    expect(result.fragments.filter((p) => !p.fixed)).toHaveLength(12);
    expect(meshClosure(fixed.mesh.positions, fixed.mesh.indices).closed).toBe(true);
  });
  test('open surfaces and empty local regions report errors', () => {
    const g = new PlaneGeometry(100, 100),
      mesh = readGeometry(g);
    g.dispose();
    expect(() => fractureMesh(api, mesh, options)).toThrow(/suljetun/);
    expect(() =>
      fractureMesh(api, block(), { ...options, region: { normal: [1, 0, 0], offset: 2000 } }),
    ).toThrow(/Rajaus/);
  });
});

test('baked fragments round-trip in a project without mutating or linking the source copies', () => {
  const source = bodySchema.parse({
    ...makeBody(1000, 200, 2000),
    origin: [8000, -9000, 100],
    component: { id: 'linked-family', offset: [0, 0, 0], rotation: [0, 0, 0, 1] },
    faceMaterials: { 0: { color: '#ff0000', appearance: defaultAppearance('paint') } },
  });
  const copy = { ...source, id: 'other-copy', origin: [0, 0, 0] as [number, number, number] };
  const project = { ...freshProject(), bodies: [source, copy] };
  const snapshot = JSON.stringify(project);
  const result = fractureMesh(api, block(), options),
    poses = restPoses(result);
  poses[0].position[2] += 300;
  const bodies = fragmentBodies(source, result, poses, '#abcdef', true);
  const next = insertFragments(project, source, bodies);
  expect(JSON.stringify(project)).toBe(snapshot);
  expect(next.project.bodies.find((b) => b.id === source.id)?.hidden).toBe(true);
  expect(next.project.bodies.find((b) => b.id === copy.id)).toEqual(copy);
  expect(bodies.every((b) => !b.component && b.feature.type === 'mesh' && b.feature.solid)).toBe(
    true,
  );
  expect(
    bodies.some((b) => Object.values(b.faceMaterials ?? {}).some((m) => m.color === '#abcdef')),
  ).toBe(true);
  expect(
    bodies.some((b) => Object.values(b.faceMaterials ?? {}).some((m) => m.color === '#ff0000')),
  ).toBe(true);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(next.project))).bodies).toEqual(
    next.project.bodies,
  );
  expect(() =>
    insertFragments(
      { ...project, bodies: [{ ...source, locked: true }, copy] },
      { ...source, locked: true },
      bodies,
    ),
  ).toThrow(/lukitus/);
});

test('gravity uses metres, hits the floor and leaves the fixed remainder in place', async () => {
  const result = fractureMesh(api, block(), {
    ...options,
    count: 4,
    region: { normal: [0, 0, 1], offset: 1500 },
  });
  const initial = restPoses(result);
  const sim = await createSimulation(result, [], 0, 0.6);
  try {
    for (let i = 0; i < 30; i++) sim.step();
    const midway = sim.poses();
    expect(midway[0].position).toEqual(initial[0].position);
    expect(
      midway.some(
        (pose, i) => !result.fragments[i].fixed && pose.position[2] < initial[i].position[2],
      ),
    ).toBe(true);
    for (let i = 0; i < 570; i++) sim.step();
    const poses = sim.poses();
    for (let i = 0; i < poses.length; i++) {
      expect(poses[i].position.every(Number.isFinite)).toBe(true);
      expect(poses[i].position[2]).toBeGreaterThan(-20);
      expect(new Vector3(...poses[i].position).length()).toBeLessThan(20000);
    }
    const saved = fragmentBodies(makeBody(1000, 200, 2000), result, poses, '#999999', true);
    expect(saved.every((b) => b.feature.type === 'mesh' && b.feature.solid)).toBe(true);
  } finally {
    sim.dispose();
  }
});
