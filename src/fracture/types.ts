import type { Vec3 } from '../model/project';
import type { SurfaceMesh } from '../surface/mesh';

export interface FractureOptions {
  count: number;
  seed: number;
  irregularity: number;
  ragged?: boolean;
  /** Local half space: dot(normal, point) >= offset is fractured. */
  region?: { normal: Vec3; offset: number };
}
export interface Fragment {
  mesh: SurfaceMesh;
  fixed: boolean;
  volume: number;
  convex: boolean;
}
export interface FractureResult {
  fragments: Fragment[];
  interiorFace: number;
  sourceVolume: number;
}
export interface Pose {
  position: Vec3;
  rotation: [number, number, number, number];
}
export interface Obstacle {
  vertices: number[];
  triangles: number[];
}
export type FractureRequest =
  | { type: 'fracture'; mesh: SurfaceMesh; options: FractureOptions }
  | {
      type: 'simulate';
      result: FractureResult;
      obstacles: Obstacle[];
      ground: number;
      kick: number;
    }
  | { type: 'pause' }
  | { type: 'resume' };
export type FractureReply =
  | { type: 'progress'; value: number }
  | { type: 'result'; result: FractureResult }
  | { type: 'poses'; poses: Pose[]; time: number; stopped: boolean }
  | { type: 'error'; message: string };
