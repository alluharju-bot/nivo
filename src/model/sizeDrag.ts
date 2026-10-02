/** A fixed screen-space direction avoids jumps on edge-on faces and curved edges. */
export interface SizeDrag {
  x: number;
  y: number;
  initial: number;
  millimetersPerPixel: number;
  direction?: [number, number];
}

export function dragSize(drag: SizeDrag, x: number, y: number): number | undefined {
  const dx = x - drag.x,
    dy = y - drag.y;
  if (!drag.direction) {
    const distance = Math.hypot(dx, dy);
    if (distance <= 4) return;
    drag.direction = [dx / distance, dy / distance];
  }
  const delta = (dx * drag.direction[0] + dy * drag.direction[1]) * drag.millimetersPerPixel;
  return Math.min(100_000, Math.max(0.1, Math.round((drag.initial + delta) * 100) / 100));
}
