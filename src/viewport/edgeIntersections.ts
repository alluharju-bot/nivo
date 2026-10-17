import { Camera, Matrix4 } from 'three';
import type { CadEdge } from '../cad/protocol';
import type { ReferencePoint } from '../model/snap';
import { edgeCrossings } from '../model/edgeCrossings';
import { projectedSegmentPoint } from './picking';

type Edge = { key: string; edge: CadEdge; synthetic?: boolean };
type PairCache = { pairs: WeakMap<CadEdge, ReturnType<typeof edgeCrossings>>; count: number };
const cache = new WeakMap<CadEdge, PairCache>();

/** Limit pair tests to the cursor's acquisition disk, not every edge in the model.
 * Cached pairs expire with their mesh, so moving/deforming a part cannot leave stale snaps. */
export function edgeIntersectionPoints(
  edges: Edge[],
  camera: Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): ReferencePoint[] {
  const projection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const ranked = edges.flatMap((item) => {
    const { edge } = item;
    const pick = projectedSegmentPoint(
      edge.start,
      edge.end,
      camera,
      width,
      height,
      x,
      y,
      projection,
    );
    return pick && pick.distance <= radius ? [{ item, distance: pick.distance }] : [];
  });
  // When thousands of edges occupy the same few pixels, zooming resolves the
  // ambiguity. Never turn that view into an unbounded quadratic pointer task.
  const near = (
    ranked.length > 128 ? ranked.sort((a, b) => a.distance - b.distance).slice(0, 128) : ranked
  ).map(({ item }) => item);
  const result: ReferencePoint[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i],
        b = near[j];
      let entry = cache.get(a.edge);
      if (!entry || entry.count >= 256) {
        entry = { pairs: new WeakMap(), count: 0 };
        cache.set(a.edge, entry);
      }
      let points = entry.pairs.get(b.edge);
      if (!points) {
        points = edgeCrossings(a.edge, b.edge);
        entry.pairs.set(b.edge, points);
        entry.count++;
      }
      for (const point of points) {
        const id = point.map((n) => Math.round(n * 1e6)).join(',');
        // Either participating part can own a move/reference anchor.
        for (const [owner, other] of [
          [a, b],
          [b, a],
        ]) {
          const owned = `${owner.key.split(':')[0]}:${id}`;
          if (seen.has(owned)) continue;
          seen.add(owned);
          result.push({
            point,
            key: `${owner.key}:intersection:${other.key}`,
            label: a.synthetic || b.synthetic ? 'Pintojen risteyspiste' : 'Reunojen risteys',
          });
        }
      }
    }
  return result;
}
