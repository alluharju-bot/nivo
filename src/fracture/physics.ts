import RAPIER from '@dimforge/rapier3d-compat';
import { meshBounds } from '../surface/mesh';
import type { Vec3 } from '../model/project';
import type { FractureResult, FractureMotion, Obstacle, Pose } from './types';
import { fragmentVelocity, validateMotion } from './motion';
import { starCollider } from './collisionShape';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

let initialized: Promise<void> | undefined;
/** The solver uses metres and Z-up. Render/export meshes remain in local millimetres. */
export async function createSimulation(
  result: FractureResult,
  obstacles: Obstacle[],
  ground: number | undefined,
  kick: number,
  motion?: FractureMotion,
  worldOrigin: Vec3 = [0, 0, 0],
) {
  if (
    (ground !== undefined && (!Number.isFinite(ground) || Math.abs(ground) > 200000)) ||
    !Number.isFinite(kick) ||
    kick < 0 ||
    kick > 3
  )
    throw new Error('Tarkista lattian korkeus ja tönäisy (0–3 m/s).');
  if (motion) validateMotion(motion);
  if (!worldOrigin.every(Number.isFinite)) throw new Error('Osan sijainti ei kelpaa.');
  await (initialized ??= RAPIER.init());
  const gravity = motion?.gravity ?? [0, 0, -9.81];
  const world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  world.timestep = motion ? 1 / 120 : 1 / 60;
  world.maxCcdSubsteps = 4;
  world.numSolverIterations = 8;
  // The metre-scale default predicts contacts 20 mm ahead. Even 0.1 mm can
  // jam an irregular flush cutout at grazing angles. Use micrometre prediction
  // with sub-millimetre envelope clearance; CCD handles actual fast impacts.
  world.integrationParameters.normalizedPredictionDistance = 0.000001;
  world.integrationParameters.normalizedAllowedLinearError = 0.000001;
  const coordinates = (vertices: number[]) => new Float32Array(vertices.map((n) => n / 1000));
  try {
    const bounds = result.fragments.map((p) => meshBounds(p.mesh));
    const lo = [0, 1].map((a) => Math.min(...bounds.map((b) => b.min[a])) / 1000);
    const hi = [0, 1].map((a) => Math.max(...bounds.map((b) => b.max[a])) / 1000);
    if (ground !== undefined) {
      const floor = RAPIER.ColliderDesc.cuboid(
        Math.max(20, hi[0] - lo[0] + 10),
        Math.max(20, hi[1] - lo[1] + 10),
        0.1,
      )
        .setTranslation((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, ground / 1000 - 0.1)
        .setFriction(0.75);
      world.createCollider(floor);
    }
    for (const obstacle of obstacles)
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          coordinates(obstacle.vertices),
          new Uint32Array(obstacle.triangles),
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
        ).setFriction(0.75),
      );
    let dynamicIndex = 0;
    const dynamicCount = result.fragments.filter((p) => !p.fixed).length;
    const bodies = result.fragments.map((fragment, i) => {
      const center = bounds[i].center;
      // A newly cut piece fits its neighbors exactly. Give its collision envelope
      // a sub-millimetre clearance so CCD does not treat tangential launch contact
      // as an impact at t=0. The actual mesh and saved geometry remain unchanged.
      const radius = Math.hypot(...bounds[i].size) / 2;
      const clearance = Math.min(0.2, Math.min(...bounds[i].size) * 0.001);
      const colliderScale = fragment.fixed ? 1 : 1 - clearance / Math.max(radius, 0.001);
      const vertices = new Float32Array(
        fragment.mesh.positions.map(
          (n, a) => ((n - center[a % 3]) / 1000) * (fragment.convex ? colliderScale : 1),
        ),
      );
      const description = (
        fragment.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()
      )
        .setTranslation(center[0] / 1000, center[1] / 1000, center[2] / 1000)
        .setCcdEnabled(true);
      const body = world.createRigidBody(description);
      // Rendering duplicates vertices at material/normal seams. Collision shapes
      // need a connected surface for adjacency and convex decomposition.
      const geometry = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute(vertices, 3),
      );
      geometry.setIndex(fragment.mesh.indices);
      const welded = mergeVertices(geometry, 1e-7);
      const collisionVertices = new Float32Array(welded.getAttribute('position').array);
      const collisionIndices = new Uint32Array(welded.index!.array);
      welded.dispose();
      geometry.dispose();
      // Fixed remainder retains its openings. Dynamic pieces use convex collision envelopes.
      const collider = fragment.fixed
        ? RAPIER.ColliderDesc.trimesh(
            collisionVertices,
            collisionIndices,
            RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
          )
        : fragment.convex
          ? RAPIER.ColliderDesc.convexHull(vertices)
          : (starCollider(collisionVertices, collisionIndices, colliderScale) ??
            RAPIER.ColliderDesc.convexDecomposition(
              collisionVertices,
              collisionIndices,
              {
                maxConvexHulls: 24,
                // Rapier resolution is a grid side length, not a total voxel budget.
                resolution: 48,
                concavity: 0.001,
                convexHullApproximation: false,
              },
              RAPIER.CompoundFlags.FIX_INTERNAL_EDGES,
            ));
      if (!collider)
        throw new Error(
          'Yhdelle palalle ei saatu ehjää törmäysmuotoa. Kokeile suurempaa palakokoa.',
        );
      world.createCollider(collider.setDensity(2200).setFriction(0.75).setRestitution(0.05), body);
      if (!fragment.fixed && motion && motion.speed > 0) {
        const v = fragmentVelocity(motion, dynamicIndex++, dynamicCount);
        body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
      } else if (!fragment.fixed && kick) {
        const angle = i * 2.399963229728653;
        body.setLinvel(
          { x: Math.cos(angle) * kick, y: Math.sin(angle) * kick, z: kick * 0.25 },
          true,
        );
      }
      return body;
    });
    let time = 0,
      limitReached = false;
    const readPoses = (): Pose[] =>
      bodies.map((b, i) => {
        if (result.fragments[i].fixed)
          return { position: bounds[i].center, rotation: [0, 0, 0, 1] };
        const p = b.translation(),
          q = b.rotation();
        return { position: [p.x * 1000, p.y * 1000, p.z * 1000], rotation: [q.x, q.y, q.z, q.w] };
      });
    let safePoses = readPoses();
    const radii = bounds.map((b) => Math.hypot(...b.size) / 2);
    return {
      stepsPerFrame: motion ? 4 : 2,
      step() {
        if (limitReached) return;
        world.step();
        const next = readPoses();
        limitReached = next.some(
          (p, i) =>
            !result.fragments[i].fixed &&
            p.position.some(
              (v, a) => !Number.isFinite(v) || Math.abs(v + worldOrigin[a]) + radii[i] > 99900,
            ),
        );
        if (limitReached) return; // Retain the last saveable pose, not an invalid far-away mesh.
        safePoses = next;
        time += world.timestep;
      },
      get limitReached() {
        return limitReached;
      },
      get time() {
        return time;
      },
      get stopped() {
        return (
          limitReached ||
          time >= 30 ||
          (time > 0.5 && bodies.every((b, i) => result.fragments[i].fixed || b.isSleeping()))
        );
      },
      poses(): Pose[] {
        return safePoses.map((p) => ({ position: [...p.position], rotation: [...p.rotation] }));
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
