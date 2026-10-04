import {
  getOC,
  Curve2D,
  Blueprint,
  drawRectangle,
  Plane,
  ProjectionCamera,
  drawProjection,
  makeCompound,
  type Sketch,
  type AnyShape,
} from 'replicad';
import { createShape } from './kernel';
import { corners, featureIsSolid, type Body, type Vec3 } from '../model/project';
import { sectionBodySignature, sectionDistance, type Section } from '../model/sections';
import { toUV, type SketchFrame } from '../model/sketch';
import { scale } from '../model/geometry';
import type { SectionResult, Projection } from './protocol';

function projection(shapes: AnyShape[], frame: SketchFrame): Projection {
  if (!shapes.length) return { visible: [], hidden: [], viewBox: [0, 0, 1, 1] };
  const compound = makeCompound(shapes.map((s) => s.clone()));
  const camera = new ProjectionCamera(frame.origin, frame.normal, frame.u);
  try {
    const { visible, hidden } = drawProjection(compound, camera);
    const viewBox = visible.toSVGViewBox(0).split(/\s+/).map(Number) as Projection['viewBox'];
    return { visible: visible.toSVGPaths().flat(), hidden: hidden.toSVGPaths().flat(), viewBox };
  } finally {
    compound.delete();
    camera.delete();
  }
}

function capPaths(shape: AnyShape, frame: SketchFrame): string[] {
  const paths: string[] = [],
    faces = shape.faces,
    oc = getOC();
  try {
    for (const face of faces) {
      const surface = new oc.BRepAdaptor_Surface(face.wrapped, false),
        surfacePoint = new oc.gp_Pnt();
      let surfacePoints: [number, number][];
      try {
        surfacePoints = [
          [0, 0],
          [1, 0],
          [0, 1],
        ].map(([u, v]) => {
          surface.D0(u, v, surfacePoint);
          return toUV([surfacePoint.X(), surfacePoint.Y(), surfacePoint.Z()], frame);
        });
      } finally {
        surfacePoint.delete();
        surface.delete();
      }
      const origin = surfacePoints[0],
        u = surfacePoints[1].map((n, i) => n - origin[i]),
        v = surfacePoints[2].map((n, i) => n - origin[i]);
      const angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI,
        mirrored = u[0] * v[1] - u[1] * v[0] < 0;
      const wires = [face.clone().outerWire(), ...face.clone().innerWires()];
      try {
        for (const wire of wires) {
          const edges = wire.edges,
            curves: Curve2D[] = [];
          try {
            for (const edge of edges) {
              const adaptor = new oc.BRepAdaptor_Curve2d(edge.wrapped, face.wrapped);
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
                if (edge.orientation === 'backward') curve.reverse();
                curves.push(curve);
              } finally {
                adaptor.delete();
              }
            }
            // Wire edge enumeration is topological, not necessarily ordered.
            const ordered = curves.splice(0, 1);
            while (curves.length) {
              const point = ordered.at(-1)!.lastPoint;
              let index = curves.findIndex(
                (c) => Math.hypot(...c.firstPoint.map((n, i) => n - point[i])) < 1e-5,
              );
              if (index < 0) {
                index = curves.findIndex(
                  (c) => Math.hypot(...c.lastPoint.map((n, i) => n - point[i])) < 1e-5,
                );
                if (index < 0) throw new Error('Leikkausreunan CAD-ketju ei sulkeudu.');
                curves[index].reverse();
              }
              ordered.push(curves.splice(index, 1)[0]);
            }
            let blueprint = new Blueprint(ordered);
            try {
              if (mirrored) {
                const next = blueprint.mirror([1, 0], [0, 0], 'plane');
                blueprint.delete();
                blueprint = next;
              }
              const rotated = blueprint.rotate(angle);
              blueprint.delete();
              blueprint = rotated;
              const translated = blueprint.translate(origin);
              blueprint.delete();
              blueprint = translated;
              paths.push(blueprint.toSVGPathD());
            } finally {
              blueprint.delete();
            }
          } finally {
            curves.forEach((c) => c.delete());
            edges.forEach((e) => e.delete());
          }
        }
      } finally {
        wires.forEach((w) => w.delete());
      }
    }
    return paths;
  } finally {
    faces.forEach((f) => f.delete());
  }
}

/** Exact BRep/plane common: holes remain holes, curved edges remain CAD curves in the drawing. */
export function sectionBodies(
  bodies: Body[],
  section: Section,
  drawing = false,
  cachedShape?: (body: Body) => AnyShape | undefined,
): SectionResult {
  const result: SectionResult = { caps: [], anchors: [] };
  const projected: AnyShape[] = [];
  const repeated = new Map<
    string,
    { body: Body; cap: SectionResult['caps'][number]; anchors: SectionResult['anchors'] }
  >();
  const viewFrame = section.flipped
    ? { ...section.frame, normal: scale(section.frame.normal, -1), u: scale(section.frame.u, -1) }
    : section.frame;
  const plane = new Plane(viewFrame.origin, viewFrame.u, viewFrame.normal);
  try {
    for (const body of bodies) {
      if (body.purpose !== 'model' && body.purpose !== 'component') continue;
      if (!featureIsSolid(body.feature)) continue;
      const pts = corners(body),
        distances = pts.map((p) => sectionDistance(section, p));
      const min = Math.min(...distances),
        max = Math.max(...distances);
      if (min > 1e-6 || (!drawing && max < -1e-6)) continue;
      const repeatKey = JSON.stringify([body.feature, sectionDistance(section, body.origin)]);
      const repeatedCut = !drawing && repeated.get(repeatKey);
      if (repeatedCut) {
        const delta = body.origin.map((n, i) => n - repeatedCut.body.origin[i]),
          signature = sectionBodySignature(body);
        const shift = (values: number[]) => values.map((n, i) => n + delta[i % 3]);
        result.caps.push({
          ...repeatedCut.cap,
          bodyId: body.id,
          vertices: shift(repeatedCut.cap.vertices),
          edges: shift(repeatedCut.cap.edges),
        });
        result.anchors.push(
          ...repeatedCut.anchors.map((a) => ({
            ...a,
            bodyId: body.id,
            signature,
            point: a.point.map((n, i) => n + delta[i]) as Vec3,
          })),
        );
        continue;
      }
      const anchorStart = result.anchors.length;
      const cached = cachedShape?.(body),
        shape = cached ?? createShape(body);
      let face: AnyShape | undefined, cut: AnyShape | undefined, prism: AnyShape | undefined;
      try {
        if (max < -1e-6) {
          projected.push(shape.clone());
          continue;
        }
        const uv = pts.map((p) => toUV(p, viewFrame));
        const x1 = Math.min(...uv.map((p) => p[0])) - 10,
          x2 = Math.max(...uv.map((p) => p[0])) + 10;
        const y1 = Math.min(...uv.map((p) => p[1])) - 10,
          y2 = Math.max(...uv.map((p) => p[1])) + 10;
        const rectangle = () =>
          drawRectangle(x2 - x1, y2 - y1)
            .translate((x1 + x2) / 2, (y1 + y2) / 2)
            .sketchOnPlane(plane) as Sketch;
        face = rectangle().face();
        cut = shape.asShape3D().intersect(face);
        const faces = cut.faces;
        const hasFaces = faces.length > 0;
        faces.forEach((f) => f.delete());
        if (hasFaces) {
          const mesh = cut.mesh({ tolerance: 0.15, angularTolerance: 0.1 });
          const cap = {
            bodyId: body.id,
            vertices: mesh.vertices,
            normals: mesh.normals,
            triangles: mesh.triangles,
            edges: cut.meshEdges({ tolerance: 0.15 }).lines,
            paths: [] as string[],
          };
          const edges = cut.edges,
            seen = new Set<string>(),
            signature = sectionBodySignature(body);
          try {
            for (const edge of edges) {
              const points = [edge.startPoint, edge.endPoint];
              for (const p of points) {
                const point = p.toTuple() as Vec3;
                p.delete();
                const key = point.map((n) => n.toFixed(5)).join(',');
                if (!seen.has(key)) {
                  seen.add(key);
                  result.anchors.push({ bodyId: body.id, signature, point });
                }
              }
            }
          } finally {
            edges.forEach((e) => e.delete());
          }
          if (drawing) cap.paths = capPaths(cut, viewFrame);
          result.caps.push(cap);
          if (!drawing)
            repeated.set(repeatKey, { body, cap, anchors: result.anchors.slice(anchorStart) });
        }
        if (drawing) {
          prism = rectangle().extrude(Math.min(-1, min - 10));
          const clipped = shape.asShape3D().intersect(prism);
          const solids = clipped.solids,
            hasSolid = solids.length > 0;
          solids.forEach((s) => s.delete());
          if (hasSolid) projected.push(clipped);
          else clipped.delete();
        }
      } finally {
        prism?.delete();
        cut?.delete();
        face?.delete();
        if (!cached) shape.delete();
      }
    }
    if (drawing) result.projection = projection(projected, viewFrame);
    return result;
  } finally {
    projected.forEach((s) => s.delete());
    plane.delete();
  }
}
