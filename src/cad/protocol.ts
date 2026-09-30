import type { Body, FaceRef } from '../model/project';

export interface BodyMesh {
  id: string;
  vertices: number[];
  normals: number[];
  triangles: number[];
  edges: number[];
  faces: { start: number; count: number; ref: FaceRef }[];
  volume: number;
}
export interface Projection {
  visible: string[];
  hidden: string[];
  viewBox: [number, number, number, number];
}
export type DrawingView = 'front' | 'right' | 'top';
export type CadRequest =
  | { type: 'build'; bodies: Body[] }
  | { type: 'project'; bodies: Body[]; view: DrawingView }
  | { type: 'probe' };
export interface ProbeResult {
  boxVolume: number;
  cutVolume: number;
  filletVolume: number;
  restoredVolume: number;
  valid: boolean;
  faceCount: number;
  frontPaths: number;
  elapsedMs: number;
}
export interface CadReply {
  id: number;
  result?: BodyMesh[] | Projection | ProbeResult;
  error?: string;
}
