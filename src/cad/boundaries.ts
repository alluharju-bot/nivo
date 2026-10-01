import type { AnyShape, Edge } from 'replicad';
import type { CadFace, FaceBoundary } from './protocol';
import { dot, sub } from '../model/geometry';

/** Only shared topological edges qualify. Coincident independent faces do not. */
export function faceBoundaries(shape: AnyShape, metadata: CadFace[]): FaceBoundary[] {
  const faces = shape.faces;
  const edges: { edge: Edge; owners: number[] }[] = [];
  try {
    for (const [index, face] of faces.entries()) {
      for (const edge of face.edges) {
        const found = edges.find((e) => e.edge.hashCode === edge.hashCode && e.edge.isSame(edge));
        if (found) {
          if (!found.owners.includes(index)) found.owners.push(index);
          edge.delete();
        } else edges.push({ edge, owners: [index] });
      }
    }
    const groups = new Map<string, FaceBoundary>();
    for (const { edge, owners } of edges) {
      if (owners.length !== 2) continue;
      const [a, b] = owners.map((index) => metadata.find((f) => f.index === index));
      if (
        !a?.planar ||
        !b?.planar ||
        dot(a.normal, b.normal) < 1 - 1e-10 ||
        Math.abs(dot(sub(a.center, b.center), a.normal)) > 1e-6
      )
        continue;
      const key = owners.join(':');
      let group = groups.get(key);
      if (!group) {
        group = { faces: [a.ref, b.ref], lines: [] };
        groups.set(key, group);
      }
      group.lines.push(...edge.meshEdges({ tolerance: 0.15 }).lines);
    }
    return [...groups.values()];
  } finally {
    edges.forEach(({ edge }) => edge.delete());
    faces.forEach((face) => face.delete());
  }
}
