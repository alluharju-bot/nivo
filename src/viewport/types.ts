import type { Anchor, Axis, Body, FaceRef, Guide, Vec3, View, WorkPlane } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import type { ReferencePoint } from '../model/snap';
export type Tool = 'select' | 'rectangle' | 'extrude' | 'move' | 'navigate' | 'measure' | 'pen';
export interface CameraCommand {
  id: number;
  type: 'fit' | 'view' | 'projection';
  view?: View;
  projection?: 'perspective' | 'orthographic';
}
export type Gesture =
  | { type: 'rectangle'; origin: Vec3; start?: Vec3; width: number; depth: number }
  | { type: 'extrude'; height: number }
  | { type: 'move'; origin: Vec3 }
  | {
      type: 'measure';
      anchor: Anchor;
      end: Vec3;
      plane: WorkPlane;
      freeAngle: boolean;
      endAnchor?: Anchor;
    }
  | { type: 'pen'; point: Vec3; close?: boolean };
export interface ViewportProps {
  bodies: Body[];
  meshes: BodyMesh[];
  selected?: string;
  selectedIds: string[];
  selectedFace?: FaceRef;
  tool: Tool;
  preview?: Body;
  axis?: Axis;
  gridSnap: boolean;
  busy: boolean;
  command?: CameraCommand;
  guides: Guide[];
  guidePreview?: Guide;
  measureMode: 'guide' | 'free';
  penPoints: Vec3[];
  penHover?: Vec3;
  reference?: ReferencePoint;
  pickReference: boolean;
  epoch: number;
  onSelect: (id?: string, face?: FaceRef, additive?: boolean) => void;
  onGesture: (gesture: Gesture) => void;
  onAccept: () => void;
  onPenHover: (point?: Vec3) => void;
  onSnap: (label: string) => void;
  onReference: (point?: ReferencePoint) => void;
  onReferencePicked: () => void;
  onPopup: (point: [number, number]) => void;
}
