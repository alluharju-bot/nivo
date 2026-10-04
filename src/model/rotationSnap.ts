/** Five-degree detents with a wider catch around the main quarter turns. */
export function rotationAngle(angle: number, free = false): number {
  if (free) return Math.round(angle * 100) / 100;
  const cardinal = Math.round(angle / 90) * 90;
  return Math.abs(angle - cardinal) <= 4 ? cardinal : Math.round(angle / 5) * 5;
}
