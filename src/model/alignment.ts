import { Quaternion, Vector3 } from 'three';
import { bounds, type Body, type Vec3 } from './project';

export type AlignmentAnchor = 'min' | 'center' | 'max';
export interface AlignmentOptions {
  frame: 'world' | 'target';
  axes: [boolean, boolean, boolean];
  source: [AlignmentAnchor, AlignmentAnchor, AlignmentAnchor];
  target: [AlignmentAnchor, AlignmentAnchor, AlignmentAnchor];
}
export const defaultAlignment = (): AlignmentOptions => ({
  frame: 'world',
  axes: [true, true, false],
  source: ['center', 'center', 'center'],
  target: ['center', 'center', 'center'],
});
export function alignmentFrame(target: Body, options: AlignmentOptions) {
  return new Quaternion(
    ...((options.frame === 'target'
      ? (target.component?.rotation ?? target.textureFrame?.rotation ?? [0, 0, 0, 1])
      : [0, 0, 0, 1]) as [number, number, number, number]),
  ).normalize();
}
export function alignmentDelta(
  source: ReturnType<typeof bounds>,
  target: ReturnType<typeof bounds>,
  options: AlignmentOptions,
  rotation = new Quaternion(),
): Vec3 {
  const at = (box: typeof source, i: number, anchor: AlignmentAnchor) =>
    anchor === 'center' ? (box.min[i] + box.max[i]) / 2 : box[anchor][i];
  return new Vector3(
    ...([0, 1, 2].map((i) =>
      options.axes[i] ? at(target, i, options.target[i]) - at(source, i, options.source[i]) : 0,
    ) as Vec3),
  )
    .applyQuaternion(rotation)
    .toArray() as Vec3;
}
