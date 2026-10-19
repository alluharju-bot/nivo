import type { Section, SectionAnchor } from '../model/sections';
import type { Body, FaceRef, Vec3, VertexAnchor } from '../model/project';
export interface CadFace {
  start: number;
  count: number;
  ref: FaceRef;
  index: number;
  normal: Vec3;
  center: Vec3;
  planar: boolean;
  cylinder?: { origin: Vec3; axis: Vec3; radius: number; sign: number };
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
  unchanged?: boolean;
}
export interface CadEdge {
  start: Vec3;
  end: Vec3;
  from: VertexAnchor;
  to: VertexAnchor;
  /** Adjacent CAD faces; exact curved anchors can lie outside display triangles. */
  adjacentFaces?: FaceRef[];
  /** Exact supporting circle for a short tessellated arc. */
  circle?: { center: Vec3; normal: Vec3; radius: number };
}
/** A complete shared boundary between two coplanar CAD faces, including curves. */
export interface FaceBoundary {
  faces: [FaceRef, FaceRef];
  lines: number[];
}
export interface BoundaryTarget extends FaceBoundary {
  bodyId: string;
}

export interface BodyMesh {
  id: string;
  vertices: number[];
  normals: number[];
  triangles: number[];
  edges: number[];
  faces: CadFace[];
  volume: number;
  stock?: import('../model/quantitySchema').QuantityBasis;
  verticesCAD: { point: Vec3; anchor: VertexAnchor }[];
  midpointsCAD: Vec3[];
  edgesCAD: CadEdge[];
  curveEdges?: CadEdge[];
  curveStations?: boolean;
  boundaries: FaceBoundary[];
  sourceDetailEdges?: { index: number; lines: number[] }[];
  detailEdges?: { index: number; lines: number[] }[];
}
export interface EdgeDetailTarget {
  bodyId: string;
  indices: number[];
  editing?: boolean;
  others?: EdgeDetailTarget[];
}
export interface EdgeDetailResult {
  body: Body;
  mesh: BodyMesh;
}
export interface Projection {
  visible: string[];
  hidden: string[];
  viewBox: [number, number, number, number];
}
export interface SectionResult {
  caps: {
    bodyId: string;
    vertices: number[];
    normals: number[];
    triangles: number[];
    edges: number[];
    paths: string[];
  }[];
  anchors: SectionAnchor[];
  projection?: Projection;
}
import type { DrawingView } from '../model/drawingViews';
export type { DrawingView } from '../model/drawingViews';
export type CadRequest =
  | { type: 'prepare-geometry'; body: Body }
  | { type: 'surface-mesh'; body: Body; tolerance: number; angle: number }
  | {
      type: 'change-dimension';
      body: Body;
      key: import('../model/editableDimensions').DimensionKey;
      value: number;
    }
  | { type: 'commit-geometry'; body: Body; points: Vec3[]; meshCopy: boolean }
  | { type: 'release-history' }
  | { type: 'import-step'; data: ArrayBuffer; name: string }
  | { type: 'export-step'; bodies: Body[] }
  | { type: 'print-meshes'; bodies: Body[]; tolerance: number }
  | {
      type: 'surface-levels';
      profiles: Body[];
      options: import('../model/surfaceLevels').SurfaceLevelOptions;
      existing?: Body;
    }
  | { type: 'scale'; bodies: Body[]; pivot: Vec3; factors: Vec3 }
  | { type: 'revolve-profile'; body: Body }
  | {
      type: 'align';
      bodies: Body[];
      target: Body;
      options: import('../model/alignment').AlignmentOptions;
    }
  | {
      type: 'revolve';
      profile?: Body;
      options: import('../model/revolution').RevolutionOptions;
      existing?: Body;
    }
  | { type: 'sweep'; path: Body; options: import('./sweep').SweepOptions }
  | { type: 'sphere'; center: Vec3; radius: number; name: string }
  | {
      type: 'bezier';
      points: Vec3[];
      name: string;
      closed: boolean;
      mode?: 'smooth' | 'bezier';
      outline?: boolean;
    }
  | {
      type: 'through-shapes';
      profiles: Body[];
      options: import('./throughShapes').ThroughShapesOptions;
    }
  | { type: 'knife'; targets: Body[]; rays: import('./modeling').KnifeRay[]; curveNormal?: Vec3 }
  | { type: 'pen-path'; points: Vec3[]; name: string }
  | {
      type: 'pen-regions';
      path: Body;
      boundaries: Body[];
      previous: Body[];
      scope: 'network' | 'stroke';
    }
  | { type: 'add-surface-regions'; body: Body; regions: Body[]; normal?: Vec3 }
  | { type: 'split-path'; body: Body; face: FaceRef; path: Body }
  | {
      type: 'cut-opening';
      profile: Body;
      targets: Body[];
      options?: import('../model/openingPattern').OpeningPattern;
    }
  | { type: 'face-profile'; body: Body; face: FaceRef }
  | { type: 'section'; bodies: Body[]; section: Section; drawing: boolean }
  | { type: 'instances'; source: Body; targets: Body[] }
  | { type: 'sync'; updates: Body[]; order: string[] }
  | { type: 'build'; bodies: Body[] }
  | { type: 'project'; bodies: Body[]; view: DrawingView }
  | { type: 'probe' }
  | { type: 'rotate'; bodies: Body[]; pivot: Vec3; axis: Vec3; angle: number }
  | { type: 'boolean'; targets: Body[]; tools: Body[]; operation: 'cut' | 'join' }
  | { type: 'merge-planar'; bodies: Body[] }
  | { type: 'split-face'; body: Body; face: FaceRef; profile: Body; allowUnsplit?: boolean }
  | { type: 'divide-surfaces'; profile: Body; targets: Body[] }
  | { type: 'offset-face'; body: Body; face: FaceRef; distance: number }
  | { type: 'offset-outline'; body: Body; face: FaceRef; distance: number }
  | { type: 'remove-boundary'; body: Body; faces: [FaceRef, FaceRef] }
  | { type: 'remove-faces'; body: Body; faces: FaceRef[] }
  | {
      type: 'edge-detail';
      body: Body;
      indices: number[];
      operation: 'fillet' | 'chamfer';
      size: number;
      editing?: boolean;
    }
  | { type: 'remove-detail'; body: Body }
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
    | import('../model/geometryEditing').EditableGeometry
    | Blob
    | import('../exchange/export').ExportMesh[]
    | import('./surfaceLevels').SurfaceLevelsResult
    | import('./penRegions').PenRegions
    | SectionResult
    | BodyMesh[]
    | BodyMesh
    | Projection
    | ProbeResult
    | Body
    | Body[]
    | SplitResult
    | SplitResult[]
    | FaceSpan
    | number[]
    | EdgeDetailResult
    | import('./paths').OpeningResult
    | import('./modeling').KnifeResult;
  meshDelta?: BodyMesh[];
  error?: string;
}
