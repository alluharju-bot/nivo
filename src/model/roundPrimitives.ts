import { SphereGeometry } from 'three';
import { bodySchema, makeBody, type Body, type Vec3 } from './project';
import type { Profile } from './sketch';

export function radialPolygon(radiusX: number, radiusY: number, sides: number): Profile {
  if (!Number.isInteger(sides) || sides < 3 || sides > 128) throw new Error('Valitse 3–128 sivua.');
  return {
    kind: 'polygon',
    points: Array.from({ length: sides }, (_, i) => [
      radiusX * Math.cos((i * Math.PI * 2) / sides),
      radiusY * Math.sin((i * Math.PI * 2) / sides),
    ]),
  };
}

/** A deliberately finite mesh, independent of CAD display tessellation. */
export function facetedSphere(center: Vec3, radius: number, sides: number, name: string): Body {
  radialPolygon(1, 1, sides);
  if (!Number.isFinite(radius) || radius < 0.05 || radius > 50000)
    throw new Error('Pallon halkaisijan tulee olla 0,1–100 000 mm.');
  const geometry = new SphereGeometry(1, sides, Math.max(2, Math.round(sides / 2)));
  geometry.rotateX(Math.PI / 2);
  try {
    const points = Array.from(geometry.getAttribute('position').array, (n) => n * radius);
    const min: Vec3 = [Infinity, Infinity, Infinity],
      max: Vec3 = [-Infinity, -Infinity, -Infinity];
    points.forEach((n, i) => {
      min[i % 3] = Math.min(min[i % 3], n);
      max[i % 3] = Math.max(max[i % 3], n);
    });
    return bodySchema.parse({
      ...makeBody(1, 1, 1),
      name,
      origin: center.map((n, i) => n + min[i]),
      feature: {
        type: 'mesh',
        width: max[0] - min[0],
        depth: max[1] - min[1],
        height: max[2] - min[2],
        vertices: points.map((n, i) => n - min[i % 3]),
        triangles: Array.from(geometry.index!.array),
        normals: Array.from(geometry.getAttribute('normal').array),
        solid: true,
      },
    });
  } finally {
    geometry.dispose();
  }
}
