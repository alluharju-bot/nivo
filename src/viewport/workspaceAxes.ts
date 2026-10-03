import * as THREE from 'three';

/** Clip an infinite world axis before projecting a thick line on the GPU. */
export function visibleAxisRange(
  frustum: THREE.Frustum,
  axis: number,
): [number, number] | undefined {
  let start = -Infinity;
  let end = Infinity;
  for (const plane of frustum.planes) {
    const direction = plane.normal.getComponent(axis);
    if (Math.abs(direction) < 1e-12) {
      if (plane.constant < 0) return;
      continue;
    }
    const boundary = -plane.constant / direction;
    if (direction > 0) start = Math.max(start, boundary);
    else end = Math.min(end, boundary);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;
  // Keep float32 endpoint rounding on the visible side of the near/far planes.
  const inset = (end - start) * 1e-6;
  return [start + inset, end - inset];
}
