import type { Vec3 } from '../model/project';
import type { SurfaceMesh } from '../surface/mesh';

export interface ImpactRegion {
  point: Vec3;
  normal: Vec3;
  diameter: number;
  /** Omit for a through cut through the first wall at the hit point. */
  depth?: number;
}

export interface FractureOptions {
  count: number;
  seed: number;
  irregularity: number;
  ragged?: boolean;
  impact?: ImpactRegion;
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
export interface FractureMotion {
  /** World-space direction; speed in m/s, cone half-angle in degrees. */
  direction: Vec3;
  speed: number;
  spread: number;
  /** Acceleration in m/s². Zero disables gravity. */
  gravity: Vec3;
}
export type FractureRequest =
  | { type: 'fracture'; mesh: SurfaceMesh; options: FractureOptions }
  | {
      type: 'simulate';
      result: FractureResult;
      obstacles: Obstacle[];
      ground?: number;
      kick: number;
      motion?: FractureMotion;
      worldOrigin?: Vec3;
    }
  | { type: 'pause' }
  | { type: 'resume' };
export type FractureReply =
  | { type: 'progress'; value: number }
  | { type: 'result'; result: FractureResult }
  | { type: 'poses'; poses: Pose[]; time: number; stopped: boolean; limitReached?: boolean }
  | { type: 'error'; message: string };
