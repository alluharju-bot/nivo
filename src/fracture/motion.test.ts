import { expect, test } from 'vitest';
import { BoxGeometry, Vector3 } from 'three';
import { readGeometry, meshBounds } from '../surface/mesh';
import { createSimulation } from './physics';
import { directionAngles, directionFromAngles, fragmentVelocity, validateMotion } from './motion';
import { fractureObstacles } from './project';
import { freshProject, makeBody, type Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import type { FractureMotion, FractureResult } from './types';

const motion: FractureMotion = {
  direction: [0, 1, 0],
  speed: 3,
  spread: 20,
  gravity: [0, 0, -9.81],
};
function cube(position: Vec3, size = 100) {
  const geometry = new BoxGeometry(size, size, size).translate(...position);
  const mesh = readGeometry(geometry);
  geometry.dispose();
  return mesh;
}
function result(position: Vec3): FractureResult {
  return {
    fragments: [{ mesh: cube(position), convex: true, fixed: false, volume: 1e6 }],
    interiorFace: 1,
    sourceVolume: 1e6,
  };
}

test('directed cone retains speed and stays inside the requested angle in every orientation', () => {
  for (const direction of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
    [1, 2, -3],
  ] as Vec3[]) {
    const axis = new Vector3(...direction).normalize();
    const angles = directionAngles(direction);
    expect(new Vector3(...directionFromAngles(...angles)).distanceTo(axis)).toBeLessThan(1e-10);
    for (let i = 0; i < 80; i++) {
      const velocity = new Vector3(...fragmentVelocity({ ...motion, direction }, i, 80));
      expect(velocity.length()).toBeCloseTo(3, 8);
      expect(velocity.angleTo(axis)).toBeLessThanOrEqual((20 * Math.PI) / 180);
    }
    expect(fragmentVelocity({ ...motion, direction, spread: 0 }, 0, 1)).toEqual(
      axis.multiplyScalar(3).toArray(),
    );
  }
  expect(() => validateMotion({ ...motion, speed: NaN })).toThrow();
  expect(() => validateMotion({ ...motion, direction: [0, 0, 0] })).toThrow();
  expect(() => validateMotion({ ...motion, gravity: [0, 0, 31] })).toThrow();
});

test('launch and independently directed gravity produce the expected displacement, repeatably', async () => {
  const input = result([0, 0, -1000]);
  const run = async () => {
    const simulation = await createSimulation(input, [], undefined, 0, {
      ...motion,
      spread: 0,
      gravity: [-4, 0, 0],
    });
    try {
      for (let i = 0; i < 60; i++) simulation.step();
      expect(simulation.time).toBeCloseTo(0.5, 6);
      return simulation.poses()[0].position;
    } finally {
      simulation.dispose();
    }
  };
  const pose = await run();
  expect(pose[0]).toBeCloseTo(-500, -1);
  expect(pose[1]).toBeCloseTo(1500, -1);
  expect(pose[2]).toBeCloseTo(-1000, 2);
  expect(await run()).toEqual(pose);
});

test('fast fragments collide with a thin wall and real cellar floor without an invisible Z=0 floor', async () => {
  const input = result([0, 0, -200]);
  const wall = new BoxGeometry(20, 3000, 3000).translate(600, 0, -1000);
  const floor = new BoxGeometry(4000, 4000, 100).translate(0, 0, -2050);
  const obstacles = [wall, floor].map((g) => {
    const mesh = readGeometry(g);
    g.dispose();
    return { vertices: mesh.positions, triangles: mesh.indices };
  });
  const sim = await createSimulation(input, obstacles, undefined, 0, {
    ...motion,
    direction: [1, 0, 0],
    speed: 20,
    spread: 0,
  });
  try {
    for (let i = 0; i < 360; i++) {
      sim.step();
      expect(sim.poses()[0].position[0]).toBeLessThan(650);
    }
    const pose = sim.poses()[0].position;
    expect(pose[2]).toBeLessThan(-1800);
    expect(pose[2]).toBeGreaterThan(-2010);
  } finally {
    sim.dispose();
  }
});

test('launch colliders include distant and below-zero scene parts, excluding hidden and construction parts', () => {
  const source = makeBody(100, 100, 100);
  const far = makeBody(100, 100, 100, [8000, 0, -3000]);
  const hidden = { ...makeBody(100, 100, 100), hidden: true };
  const construction = { ...makeBody(100, 100, 100), purpose: 'construction' as const };
  const bodies = [source, far, hidden, construction];
  const meshes = bodies.map((b) => {
    const m = cube(b.origin);
    return { id: b.id, vertices: m.positions, triangles: m.indices } as BodyMesh;
  });
  const obstacles = fractureObstacles(source, meshes, { ...freshProject(), bodies });
  expect(obstacles).toHaveLength(1);
  expect(Math.min(...obstacles[0].vertices.filter((_, i) => i % 3 === 0))).toBe(7950);
  expect(meshBounds(cube(far.origin)).center[2]).toBe(-3000);
});

test('an unbounded throw stops at the model limit and retains the last saveable pose', async () => {
  const input = result([0, 0, 0]);
  const sim = await createSimulation(
    input,
    [],
    undefined,
    0,
    { ...motion, direction: [1, 0, 0], speed: 20, spread: 0, gravity: [0, 0, 0] },
    [98000, 0, 0],
  );
  try {
    for (let i = 0; i < 120 && !sim.stopped; i++) sim.step();
    expect(sim.limitReached).toBe(true);
    const position = sim.poses()[0].position;
    expect(position[0]).toBeGreaterThan(1000);
    expect(position[0] + 98000).toBeLessThan(99900);
    sim.step();
    expect(sim.poses()[0].position).toEqual(position);
  } finally {
    sim.dispose();
  }
});
