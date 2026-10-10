import { shapeEdges, shapeFaces } from './topology';
import { getOC, type AnyShape, type Edge } from 'replicad';

/** Keep real creases, excluding a cylinder's seam and smooth surface junctions.
 * Indices always refer to the original CAD edge array, including after serialization.
 */
export function detailEdgeIndices(shape: AnyShape, edges: Edge[]): Set<number> {
  const oc = getOC();
  const byHash = new Map<number, { edge: Edge; index: number; owners: number[] }[]>();
  for (const [index, edge] of edges.entries()) {
    const hash = edge.hashCode;
    const entry = { edge, index, owners: [] as number[] };
    const bucket = byHash.get(hash);
    if (bucket) bucket.push(entry);
    else byHash.set(hash, [entry]);
  }
  const faces = shapeFaces(shape);
  try {
    for (const [index, face] of faces.entries()) {
      const boundary = shapeEdges(face);
      try {
        for (const edge of boundary) {
          const entry = byHash.get(edge.hashCode)?.find((e) => e.edge.isSame(edge));
          if (entry && !entry.owners.includes(index)) entry.owners.push(index);
        }
      } finally {
        boundary.forEach((edge) => edge.delete());
      }
    }
    const chosen = new Set<number>();
    for (const bucket of byHash.values())
      for (const { edge, index, owners } of bucket) {
        if (owners.length !== 2 || oc.BRep_Tool.Degenerated(edge.wrapped)) continue;
        const [a, b] = owners.map((i) => faces[i]);
        try {
          if (
            oc.BRepLib.ContinuityOfFaces(edge.wrapped, a.wrapped, b.wrapped, 1e-6) !==
            oc.GeomAbs_Shape.GeomAbs_C0
          )
            continue;
        } catch {
          // If continuity cannot be established, let the exact fillet kernel decide.
        }
        chosen.add(index);
      }
    return chosen;
  } finally {
    faces.forEach((face) => face.delete());
  }
}
