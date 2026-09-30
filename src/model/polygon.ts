export type Point2 = [number, number];
const cross = (a: Point2, b: Point2, c: Point2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (a: number, b: number, c: number) =>
  c >= Math.min(a, b) - 1e-7 && c <= Math.max(a, b) + 1e-7;
function intersects(a: Point2, b: Point2, c: Point2, d: Point2) {
  const x = cross(a, b, c),
    y = cross(a, b, d),
    u = cross(c, d, a),
    v = cross(c, d, b);
  if (x * y < 0 && u * v < 0) return true;
  const cases: [number, Point2, Point2, Point2][] = [
    [x, c, a, b],
    [y, d, a, b],
    [u, a, c, d],
    [v, b, c, d],
  ];
  return cases.some(
    ([area, p, s, e]) =>
      Math.abs(area) < 1e-7 && between(s[0], e[0], p[0]) && between(s[1], e[1], p[1]),
  );
}
export function polygonArea(points: Point2[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const next = points[(i + 1) % points.length];
        return sum + p[0] * next[1] - next[0] * p[1];
      }, 0),
    ) / 2
  );
}
export function polygonError(points: Point2[]): string | undefined {
  if (points.length < 3) return 'Muoto tarvitsee vähintään kolme verteksiä.';
  if (points.length > 300) return 'Yhdessä muodossa voi olla enintään 300 verteksiä.';
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1)
      return 'Kaksi peräkkäistä verteksiä ovat liian lähellä toisiaan.';
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length]))
        return 'Reunat leikkaavat toisensa. Siirrä tai poista viimeinen verteksi.';
    }
  }
  if (polygonArea(points) < 0.01) return 'Verteksit eivät muodosta pinta-alaa.';
}
