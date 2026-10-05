import type { GuideEndpoint } from '../model/guideEditing';
import type { Section } from '../model/sections';
import type { PickCandidate } from '../ui/OverlapPicker';
import type { ReferenceImage } from '../model/referenceImages';
import type { SectionResult } from '../cad/protocol';
import type { TextureAsset } from '../model/materials';
import type { Rotation } from '../model/transforms';
import type {
  Anchor,
  PointDimension,
  Axis,
  Body,
  BodyGroup,
  Dimension,
  FaceRef,
  Guide,
  Vec3,
  View,
  WorkPlane,
} from '../model/project';
import type {
  BodyMesh,
  FaceTarget,
  FaceSpan,
  BoundaryTarget,
  EdgeDetailTarget,
  EdgeDetailResult,
} from '../cad/protocol';
import type { ReferencePoint } from '../model/snap';
import type { SketchFrame } from '../model/sketch';
export type Tool =
  | 'knife'
  | 'paint'
  | 'detail'
  | 'erase'
  | 'offset'
  | 'rotate'
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'boolean'
  | 'extrude'
  | 'move'
  | 'navigate'
  | 'measure'
  | 'pen';
export interface CameraCommand {
  id: number;
  type: 'fit' | 'view' | 'projection' | 'origin' | 'frame';
  frame?: SketchFrame;
  width?: number;
  height?: number;
  view?: View;
  projection?: 'perspective' | 'orthographic';
}
export type Gesture =
  | { type: 'profile'; frame: SketchFrame; width: number; depth: number; start?: Vec3; end?: Vec3 }
  | { type: 'rectangle'; origin: Vec3; start?: Vec3; width: number; depth: number }
  | { type: 'extrude'; distance: number }
  | { type: 'offset'; distance: number }
  | { type: 'detail'; size: number }
  | { type: 'move'; origin: Vec3; bodyId?: string; axis?: Axis }
  | {
      type: 'measure';
      anchor: Anchor;
      end: Vec3;
      plane: WorkPlane;
      freeAngle: boolean;
      endAnchor?: Anchor;
      direction?: Vec3;
      offset?: Vec3;
      edgeLength?: number;
    }
  | { type: 'pen'; point: Vec3; close?: boolean };
export interface ViewportProps {
  knifeMode: 'line' | 'polyline' | 'curve' | 'free';
  knifeCommand?: { id: number; action: 'finish' | 'clear' };
  onKnife: (rays: import('../cad/modeling').KnifeRay[], curveNormal?: Vec3) => void;
  onKnifeExit: () => void;
  section?: Section;
  sectionResult?: SectionResult;
  sectionControls?: boolean;
  sectionExtent?: number;
  sectionPick?: boolean;
  onWorkspaceCancel?: () => void;
  onSectionPick?: (target: FaceTarget) => void;
  onSectionMove?: (section: Section, commit: boolean) => void;
  referenceImages?: ReferenceImage[];
  calibration?: { id: string; points: [number, number][] };
  onCalibrationPoint?: (point: [number, number]) => void;
  editingBodyId?: string;
  scopeIds?: string[];
  onPaint: (id: string) => void;
  onContextMenu: (target: {
    x: number;
    y: number;
    bodyId?: string;
    guideId?: string;
    candidates?: PickCandidate[];
  }) => void;
  modalOpen?: boolean;
  pickOthers?: boolean;
  pickHoveredIds?: string[];
  onPickCandidates?: (target: { x: number; y: number; candidates: PickCandidate[] }) => void;
  onEditBody: (id: string) => void;
  onCloseBodyEdit: () => void;
  onEditBlocked: (position: { x: number; y: number }) => void;
  detailTarget?: EdgeDetailTarget;
  detailPreview?: EdgeDetailResult;
  detailSize: number;
  detailSizeLocked: boolean;
  detailOperation: 'fillet' | 'chamfer';
  detailPreviewSize?: number;
  onDetailEdge: (bodyId: string, index: number, dragging?: boolean) => void;
  onDetailDragCancel: () => void;
  onRemoveBoundary: (target: BoundaryTarget) => void;
  onRemoveWire: (id: string) => void;
  onRemoveGuide: (id: string) => void;
  rotation?: Rotation;
  onRotationPick: (pivot: Vec3, axis?: Vec3, bodyId?: string) => void;
  onRotationAngle: (angle: number) => void;
  onRotationAxis: (axis: Vec3) => void;
  assets?: Record<string, TextureAsset>;
  bodies: Body[];
  groups: BodyGroup[];
  dimensions: Dimension[];
  dimensionDisplay: 'all' | 'selected' | 'hidden';
  meshes: BodyMesh[];
  selected?: string;
  selectedIds: string[];
  moveHoveredIds?: string[];
  onMoveHover?: (id?: string) => number;
  selectedGroupId?: string;
  selectedFace?: FaceRef;
  tool: Tool;
  preview?: Body;
  moveMode?: 'axis' | 'free';
  copyMove: boolean;
  onCopyMove: (copy: boolean) => void;
  offsetDistance: number;
  offsetOutline?: number[];
  offsetPreviewDistance?: number;
  axis?: Axis;
  gridSnap: boolean;
  gridStep: number;
  busy: boolean;
  command?: CameraCommand;
  guides: Guide[];
  guidePreview?: Guide;
  guideXray: boolean;
  axisStyle: 'subtle' | 'strong';
  axisLabels: boolean;
  selectedGuideId?: string;
  selectedGuideIds: string[];
  freeRotate: boolean;
  guideRotationStep: number;
  faceTarget?: FaceTarget;
  faceDistance: number;
  extrusionLocked: boolean;
  faceSpan?: FaceSpan;
  measureMode: 'guide' | 'free' | 'dimension';
  measureStart?: Pick<Guide, 'anchor' | 'plane'>;
  guidePointEditing?: boolean;
  onEditGuidePoint: (target: GuideEndpoint) => void;
  onGuidePointMenu: (menu: { x: number; y: number; targets: GuideEndpoint[] }) => void;
  onDimensionPreview: (dimension?: PointDimension) => void;
  onDimensionCommit: (dimension: PointDimension) => void;
  penMode: 'line' | 'bezier';
  spherePreview: boolean;
  penPoints: Vec3[];
  penHover?: Vec3;
  reference?: ReferencePoint;
  pickReference: boolean;
  epoch: number;
  onSelect: (id?: string, face?: FaceRef, additive?: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean, guideIds?: string[]) => void;
  onGesture: (gesture: Gesture) => void;
  onAccept: (continueMeasure?: boolean) => void;
  onPenHover: (point?: Vec3) => void;
  onSnap: (label: string) => void;
  onReference: (point?: ReferencePoint) => void;
  onReferencePicked: () => void;
  onStart: () => void;
  onMoveTarget: (id: string) => string[] | undefined;
  onFaceTarget: (target: FaceTarget) => void;
  onFaceHover: (target?: FaceTarget) => void;
  onSelectGuide: (id: string, additive?: boolean) => void;
  onAxis: (axis?: Axis) => void;
  onConstraint: (direction?: Vec3) => void;
  radialShape: 'circle' | 'ellipse' | 'polygon';
  sketchFrame?: SketchFrame;
  sketchTarget?: FaceTarget;
  onSketchPlane: (frame: SketchFrame, target?: FaceTarget) => void;
  booleanTargets: string[];
  booleanTools: string[];
  pickDepth: boolean;
  onDepthPicked: (distance: number) => void;
}
