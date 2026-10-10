import { Triangle, Vector3 } from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { ReferencePoint } from './snap';

const cache = new WeakMap<BodyMesh, ReferencePoint[]>();

/** Surface tools acquire the visible face's center, never a point inside the solid. */
export function surfaceCenters(mesh: BodyMesh): ReferencePoint[] {
  const cached = cache.get(mesh);
  if (cached) return cached;
  const triangle = new Triangle(),
    point = new Vector3();
  const result = mesh.faces.flatMap((face): ReferencePoint[] => {
    if (!face.planar) return [];
    point.fromArray(face.center);
    // A CAD face's area centroid can lie in a hole or outside a concave
    // boundary. Such a point must not masquerade as a point on the surface.
    for (let i = face.start; i < face.start + face.count; i += 3) {
      triangle.a.fromArray(mesh.vertices, mesh.triangles[i] * 3);
      triangle.b.fromArray(mesh.vertices, mesh.triangles[i + 1] * 3);
      triangle.c.fromArray(mesh.vertices, mesh.triangles[i + 2] * 3);
      if (triangle.containsPoint(point))
        return [
          {
            point: face.center,
            label: 'Pinnan keskipiste',
            key: `${mesh.id}:face:${face.ref}:mid`,
          },
        ];
    }
    return [];
  });
  cache.set(mesh, result);
  return result;
}
