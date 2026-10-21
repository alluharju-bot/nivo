import RAPIER from '@dimforge/rapier3d-compat';
import { meshBounds } from '../surface/mesh';
import type { FractureResult, Obstacle, Pose } from './types';

let initialized: Promise<void> | undefined;
/** The solver uses metres and Z-up. Render/export meshes remain in local millimetres. */
export async function createSimulation(
  result: FractureResult,
  obstacles: Obstacle[],
  ground: number,
  kick: number,
) {
  if (
    !Number.isFinite(ground) ||
    !Number.isFinite(kick) ||
    Math.abs(ground) > 200000 ||
    kick < 0 ||
    kick > 3
  )
    throw new Error('Tarkista lattian korkeus ja tönäisy (0–3 m/s).');
  await (initialized ??= RAPIER.init());
  const world = new RAPIER.World({ x: 0, y: 0, z: -9.81 });
  world.timestep = 1 / 60;
  world.numSolverIterations = 8;
  const coordinates = (vertices: number[]) => new Float32Array(vertices.map((n) => n / 1000));
  try {
    const bounds = result.fragments.map((p) => meshBounds(p.mesh));
    const lo = [0, 1].map((a) => Math.min(...bounds.map((b) => b.min[a])) / 1000);
    const hi = [0, 1].map((a) => Math.max(...bounds.map((b) => b.max[a])) / 1000);
    const floor = RAPIER.ColliderDesc.cuboid(
      Math.max(20, hi[0] - lo[0] + 10),
      Math.max(20, hi[1] - lo[1] + 10),
      0.1,
    )
      .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, ground / 1000 - 0.1)
      .setFriction(0.75);
    world.createCollider(floor);
    for (const obstacle of obstacles)
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          coordinates(obstacle.vertices),
          new Uint32Array(obstacle.triangles),
        ).setFriction(0.75),
      );
    const bodies = result.fragments.map((fragment, i) => {
      const center = bounds[i].center;
      const vertices = new Float32Array(
        fragment.mesh.positions.map((n, a) => (n - center[a % 3]) / 1000),
      );
      const description = (
        fragment.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()
      )
        .setTranslation(center[0] / 1000, center[1] / 1000, center[2] / 1000)
        .setCcdEnabled(true);
      const body = world.createRigidBody(description);
      // Fixed remainder retains its openings. Dynamic pieces use convex collision envelopes.
      const collider = fragment.fixed
        ? RAPIER.ColliderDesc.trimesh(vertices, new Uint32Array(fragment.mesh.indices))
        : fragment.convex
          ? RAPIER.ColliderDesc.convexHull(vertices)
          : RAPIER.ColliderDesc.convexDecomposition(
              vertices,
              new Uint32Array(fragment.mesh.indices),
              { maxConvexHulls: 24, resolution: 20000, concavity: 0.01 },
            );
      if (!collider)
        throw new Error(
          'Yhdelle palalle ei saatu ehjää törmäysmuotoa. Kokeile suurempaa palakokoa.',
        );
      world.createCollider(collider.setDensity(2200).setFriction(0.75).setRestitution(0.05), body);
      if (!fragment.fixed && kick) {
        const angle = i * 2.399963229728653;
        body.setLinvel(
          { x: Math.cos(angle) * kick, y: Math.sin(angle) * kick, z: kick * 0.25 },
          true,
        );
      }
      return body;
    });
    let time = 0;
    return {
      step() {
        world.step();
        time += world.timestep;
      },
      get time() {
        return time;
      },
      get stopped() {
        return (
          time >= 30 ||
          (time > 0.5 && bodies.every((b, i) => result.fragments[i].fixed || b.isSleeping()))
        );
      },
      poses(): Pose[] {
        return bodies.map((b, i) => {
          if (result.fragments[i].fixed)
            return { position: bounds[i].center, rotation: [0, 0, 0, 1] } as Pose;
          const p = b.translation(),
            q = b.rotation();
          return { position: [p.x * 1000, p.y * 1000, p.z * 1000], rotation: [q.x, q.y, q.z, q.w] };
        });
      },
      dispose() {
        world.free();
      },
    };
  } catch (error) {
    world.free();
    throw error;
  }
}
