import type { Body, FaceRef, Vec3, VertexAnchor } from '../model/project';
export interface CadFace {
  start: number;
  count: number;
  ref: FaceRef;
  index: number;
  normal: Vec3;
  center: Vec3;
  planar: boolean;
}
export interface FaceTarget {
  bodyId: string;
  face: FaceRef;
  normal: Vec3;
  point: Vec3;
}
export interface FaceSpan {
  start: Vec3;
  end: Vec3;
  depth: number;
  solid: boolean;
}
export interface SplitResult {
  body: Body;
  face: FaceRef;
}
export interface CadEdge {
  start: Vec3;
  end: Vec3;
  from: VertexAnchor;
  to: VertexAnchor;
}

export interface BodyMesh {
  id: string;
  vertices: number[];
  normals: number[];
  triangles: number[];
  edges: number[];
  faces: CadFace[];
  volume: number;
  verticesCAD: { point: Vec3; anchor: VertexAnchor }[];
  midpointsCAD: Vec3[];
  edgesCAD: CadEdge[];
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
  | { type: 'probe' }
  | { type: 'rotate'; bodies: Body[]; pivot: Vec3; axis: Vec3; angle: number }
  | { type: 'boolean'; targets: Body[]; tools: Body[]; operation: 'cut' | 'join' }
  | { type: 'split-face'; body: Body; face: FaceRef; profile: Body }
  | { type: 'offset-face'; body: Body; face: FaceRef; distance: number }
  | { type: 'offset-outline'; body: Body; face: FaceRef; distance: number }
  | { type: 'face-span'; body: Body; face: FaceRef; point?: Vec3 }
  | { type: 'push-pull'; body: Body; face: FaceRef; distance: number };
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
  result?:
    BodyMesh[] | Projection | ProbeResult | Body | Body[] | SplitResult | FaceSpan | number[];
  error?: string;
}
