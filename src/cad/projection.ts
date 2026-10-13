import {
  Blueprint,
  Curve2D,
  drawRectangle,
  getOC,
  makeProjectedEdges,
  type AnyShape,
  type Sketch,
  type Edge,
  type ProjectionCamera,
} from 'replicad';
import type { Projection } from './protocol';

/** HLR curves are already in the camera's XY plane. Convert independently:
 * unlike Replicad 1.1's stitcher this accepts empty hidden/visible edge sets.
 * CAD arcs and splines remain vector curves; no tessellation enters the drawing. */
export function projectEdges(shape: AnyShape, camera: ProjectionCamera): Projection {
  const edges = makeProjectedEdges(shape, camera),
    oc = getOC();
  const plane = (drawRectangle(1000, 1000).sketchOnPlane() as Sketch).face();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const paths = (list: Edge[], bounds: boolean) =>
    list.map((edge) => {
      const adaptor = new oc.BRepAdaptor_Curve2d(edge.wrapped, plane.wrapped);
      let blueprint: Blueprint | undefined;
      try {
        const curve = new Curve2D(
          new oc.Geom2d_TrimmedCurve(
            adaptor.Curve(),
            adaptor.FirstParameter(),
            adaptor.LastParameter(),
            true,
            true,
          ),
        );
        blueprint = new Blueprint([curve]);
        if (edge.orientation === 'backward') curve.reverse();
        const [x, y, w, h] = blueprint.toSVGViewBox(0).split(/\s+/).map(Number);
        if (bounds) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
        }
        return blueprint.toSVGPathD();
      } finally {
        blueprint?.delete();
        adaptor.delete();
      }
    });
  try {
    const visible = paths(edges.visible, true),
      hidden = paths(edges.hidden, !edges.visible.length);
    return {
      visible,
      hidden,
      viewBox: Number.isFinite(minX) ? [minX, minY, maxX - minX, maxY - minY] : [0, 0, 1, 1],
    };
  } finally {
    plane.delete();
    edges.visible.forEach((e) => e.delete());
    edges.hidden.forEach((e) => e.delete());
  }
}
