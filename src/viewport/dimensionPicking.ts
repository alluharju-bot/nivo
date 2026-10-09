/** Pick the visible SVG geometry in pixels; model depth and zoom do not change the hit area. */
export function dimensionAt(host: HTMLElement, x: number, y: number) {
  const groups = [...host.querySelectorAll<SVGGElement>('.model-dimensions [data-dimension]')];
  for (const group of groups.reverse()) {
    const box = group.getBoundingClientRect();
    if (x < box.left - 8 || x > box.right + 8 || y < box.top - 8 || y > box.bottom + 8) continue;
    const label = group.querySelector('.dimension-label')?.getBoundingClientRect();
    if (
      label &&
      x >= label.left - 5 &&
      x <= label.right + 5 &&
      y >= label.top - 5 &&
      y <= label.bottom + 5
    )
      return group.dataset.dimension;
    const path = group.querySelector<SVGPathElement>('.dimension-hit');
    const matrix = path?.getScreenCTM();
    if (
      path &&
      matrix &&
      path.isPointInStroke(new DOMPoint(x, y).matrixTransform(matrix.inverse()))
    )
      return group.dataset.dimension;
  }
}

export function dimensionBoxSelection(
  host: HTMLElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  crossing: boolean,
) {
  const left = Math.min(x1, x2),
    right = Math.max(x1, x2),
    top = Math.min(y1, y2),
    bottom = Math.max(y1, y2);
  return [...host.querySelectorAll<SVGGElement>('.model-dimensions [data-dimension]')]
    .filter((group) => {
      const b = group.getBoundingClientRect();
      return crossing
        ? b.right >= left && b.left <= right && b.bottom >= top && b.top <= bottom
        : b.left >= left && b.right <= right && b.top >= top && b.bottom <= bottom;
    })
    .map((group) => group.dataset.dimension!);
}
