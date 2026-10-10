import { getOC, Edge, Face, type AnyShape } from 'replicad';
import type { TopAbs_ShapeEnum, TopoDS_Shape } from 'replicad-opencascadejs';

/** Preserve OCCT traversal order / saved face and edge indices, with hash buckets
 * instead of comparing every encountered item against every previous item.
 * Hash collisions still require IsSame; coincident independent edges stay separate.
 */
function topology<T extends AnyShape>(
  shape: AnyShape,
  kind: TopAbs_ShapeEnum,
  wrap: (raw: TopoDS_Shape) => T,
): T[] {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(shape.wrapped, kind, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const result: T[] = [],
    buckets = new Map<number, T[]>();
  try {
    while (explorer.More()) {
      const raw = explorer.Current();
      try {
        const hash = oc.ReplicadShapeHasher.HashCode(raw, 2147483647);
        const bucket = buckets.get(hash);
        if (!bucket?.some((item) => item.wrapped.IsSame(raw))) {
          const item = wrap(raw);
          result.push(item);
          if (bucket) bucket.push(item);
          else buckets.set(hash, [item]);
        }
      } finally {
        raw.delete();
      }
      explorer.Next();
    }
    return result;
  } catch (error) {
    result.forEach((item) => item.delete());
    throw error;
  } finally {
    explorer.delete();
  }
}

export function shapeEdges(shape: AnyShape) {
  const oc = getOC();
  return topology(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (raw) => new Edge(oc.TopoDS.Edge(raw)));
}
export function shapeFaces(shape: AnyShape) {
  const oc = getOC();
  return topology(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (raw) => new Face(oc.TopoDS.Face(raw)));
}
