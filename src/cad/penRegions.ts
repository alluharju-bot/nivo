import {
  assembleWire,
  makeFace,
  makeNonPlanarFace,
  loft,
  getOC,
  cast,
  type AnyShape,
  type Edge,
} from 'replicad';
import { bodyFromShape, createShape, shapeIsValid } from './kernel';
import { makeBody, type Body, type Vec3 } from '../model/project';
import { add, dot, scale, sub, unit } from '../model/geometry';
import { cross, sketchFrame, toUV } from '../model/sketch';

export interface PenRegions {
  bodies: Body[];
  replaceIds: string[];
}

/** Fill bounded cells in a spatial drawing network. Heights are never flattened:
 * projection orders connected edges; exact CAD curves bound the resulting faces. */
export function fillPenRegions(path: Body, boundaries: Body[], previous: Body[] = []): PenRegions {
  const empty = { bodies: [], replaceIds: [] };
  if (boundaries.length > 255) return empty;
  const shapes: AnyShape[] = [],
    edges: Edge[] = [];
  let result: AnyShape | undefined;
  const oc = getOC(),
    splitter = new oc.BRepAlgoAPI_Splitter();
  const sources = [path, ...boundaries];
  try {
    const args = splitter.Arguments();
    try {
      for (const body of sources) {
        const shape = createShape(body);
        shapes.push(shape);
        const wires = shape.wires;
        try {
          for (const wire of wires) args.Append(wire.wrapped);
        } finally {
          wires.forEach((w) => w.delete());
        }
      }
      splitter.SetArguments(args);
    } finally {
      args.delete();
    }
    splitter.SetNonDestructive(true);
    splitter.SetFuzzyValue(1e-6);
    if (sources.length === 1) result = shapes[0].clone();
    else {
      splitter.Build();
      result = cast(splitter.Shape());
    }
    edges.push(...result.edges);
    if (edges.length > 2000) return empty;
    const tuple = (edge: Edge, t: number): Vec3 => {
      const p = edge.pointAt(t);
      try {
        return p.toTuple();
      } finally {
        p.delete();
      }
    };
    const nodes: Vec3[] = [];
    const node = (p: Vec3) => {
      const i = nodes.findIndex((q) => Math.hypot(...sub(p, q)) < 1e-5);
      if (i >= 0) return i;
      nodes.push(p);
      return nodes.length - 1;
    };
    const unique = new Set<string>();
    const links = edges.flatMap((edge) => {
      const a = tuple(edge, 0),
        b = tuple(edge, 1),
        mid = tuple(edge, 0.5);
      const from = node(a),
        to = node(b);
      // BOP may return shared edges repeatedly through adjacent wires.
      const key = `${Math.min(from, to)}:${Math.max(from, to)}:${mid.map((n) => Math.round(n * 1e5)).join(',')}`;
      if (unique.has(key)) return [];
      unique.add(key);
      return [
        { edge, from, to, mid, samples: Array.from({ length: 17 }, (_, i) => tuple(edge, i / 16)) },
      ];
    });
    const pathEdges = shapes[0].edges;
    let seeds: number[];
    try {
      const ends = pathEdges.flatMap((e) => [tuple(e, 0), tuple(e, 1)]);
      seeds = nodes.flatMap((p, i) =>
        ends.some((q) => Math.hypot(...sub(p, q)) < 1e-5) ? [i] : [],
      );
    } finally {
      pathEdges.forEach((e) => e.delete());
    }
    // Only the connected network touched by this pen stroke participates.
    const connected = new Set(seeds);
    for (let changed = true; changed;) {
      changed = false;
      for (const link of links)
        if (connected.has(link.from) || connected.has(link.to)) {
          for (const id of [link.from, link.to])
            if (!connected.has(id)) {
              connected.add(id);
              changed = true;
            }
        }
    }
    const active = links.filter((e) => connected.has(e.from));
    if (active.length < 3) return empty;
    const points = active.flatMap((e) => e.samples);
    const origin = points[0];
    const far = points.reduce((a, b) =>
      Math.hypot(...sub(a, origin)) > Math.hypot(...sub(b, origin)) ? a : b,
    );
    const baseline = sub(far, origin);
    const normal = unit(
      points
        .map((p) => cross(baseline, sub(p, origin)))
        .reduce((a, b) => (Math.hypot(...a) > Math.hypot(...b) ? a : b)),
    );
    if (Math.hypot(...normal) < 0.5) return empty;
    const frame = sketchFrame(origin, normal);
    type Half = {
      link: (typeof active)[number];
      from: number;
      to: number;
      reverse: boolean;
      angle: number;
      twin: number;
    };
    const halves: Half[] = [];
    const outgoing = new Map<number, number[]>();
    for (const link of active) {
      for (const reverse of [false, true]) {
        const from = reverse ? link.to : link.from,
          to = reverse ? link.from : link.to;
        const sample = reverse ? link.samples.at(-2)! : link.samples[1];
        const a = toUV(nodes[from], frame),
          b = toUV(sample, frame);
        const index = halves.length;
        halves.push({
          link,
          from,
          to,
          reverse,
          angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
          twin: reverse ? index - 1 : index + 1,
        });
        outgoing.set(from, [...(outgoing.get(from) ?? []), index]);
      }
    }
    for (const list of outgoing.values()) list.sort((a, b) => halves[a].angle - halves[b].angle);
    const seen = new Set<number>(),
      loops: Half[][] = [];
    for (let seed = 0; seed < halves.length; seed++) {
      if (seen.has(seed)) continue;
      const loop: Half[] = [];
      let next = seed;
      while (!seen.has(next)) {
        seen.add(next);
        const half = halves[next];
        loop.push(half);
        const list = outgoing.get(half.to)!;
        next = list[(list.indexOf(half.twin) + list.length - 1) % list.length];
      }
      if (next !== seed || loop.length < 2 || new Set(loop.map((h) => h.link)).size !== loop.length)
        continue;
      const uv = loop
        .flatMap((h) => (h.reverse ? [...h.link.samples].reverse() : h.link.samples).slice(0, -1))
        .map((p) => toUV(p, frame));
      const area =
        uv.reduce((sum, p, i) => {
          const q = uv[(i + 1) % uv.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0) / 2;
      // Positive winding is the bounded face. The outside and dangling branches are excluded.
      if (area > 1e-4) loops.push(loop);
    }
    const sourceEdges = sources.map((b, i) => ({ body: b, edges: shapes[i].edges }));
    try {
      const owns = (edge: Edge, link: (typeof active)[number]) => {
        const samples = [tuple(edge, 0), tuple(edge, 0.5), tuple(edge, 1)];
        if (edge.geomType === 'LINE') {
          const d = sub(samples[2], samples[0]),
            length2 = dot(d, d);
          if (length2 < 1e-12) return false;
          return [nodes[link.from], link.mid, nodes[link.to]].every((p) => {
            const t = dot(sub(p, samples[0]), d) / length2;
            return (
              t >= -1e-7 &&
              t <= 1 + 1e-7 &&
              Math.hypot(...sub(p, add(samples[0], scale(d, t)))) < 1e-5
            );
          });
        }
        // The BOP history maps trimmed circular / spline pieces to their original edges.
        if (sources.length === 1) return edge.isSame(link.edge);
        const history = splitter.Modified(edge.wrapped);
        const modified = new oc.NCollection_List_TopoDS_Shape(history);
        history.delete();
        try {
          if (modified.IsEmpty()) return edge.isSame(link.edge);
          while (!modified.IsEmpty()) {
            const s = modified.First();
            try {
              if (s.IsSame(link.edge.wrapped)) return true;
            } finally {
              s.delete();
            }
            modified.RemoveFirst();
          }
        } finally {
          modified.delete();
        }
        return false;
      };
      const owners = new Map(
        active.map((link) => [
          link,
          sourceEdges.filter((s) => s.edges.some((e) => owns(e, link))).map((s) => s.body.id),
        ]),
      );
      const networkIds = [...new Set([...owners.values()].flat())];
      const related = previous.filter((b) =>
        b.penRegion?.sources.some((id) => networkIds.includes(id)),
      );
      // A locked, hidden, moved, copied or subsequently sculpted patch is no longer
      // regenerated by drawing. Keep it intact instead of overlaying a replacement.
      if (
        related.some(
          (b) =>
            b.locked ||
            b.hidden ||
            b.penRegion!.detached ||
            b.penRegion!.owner !== b.id ||
            b.origin.some((n, i) => Math.abs(n - b.penRegion!.origin[i]) > 1e-6),
        )
      )
        return empty;
      const penIds = new Set(
        sources.filter((b) => b.id === path.id || b.purpose === 'drawing').map((b) => b.id),
      );
      const bodies: Body[] = [];
      for (const loop of loops) {
        if (!loop.some((h) => owners.get(h.link)!.some((id) => penIds.has(id)))) continue;
        const oriented = loop.map((h) => {
          const e = h.link.edge.clone();
          if (!h.reverse) return e;
          const reversed = e.flipOrientation() as unknown as Edge;
          e.delete();
          return reversed;
        });
        let wire: ReturnType<typeof assembleWire> | undefined, face: AnyShape | undefined;
        try {
          wire = assembleWire(oriented);
          const verts = loop.flatMap((h) => h.link.samples);
          const planar = verts.every((p) => Math.abs(dot(sub(p, origin), normal)) < 1e-5);
          if (planar) face = makeFace(wire);
          else if (oriented.length === 4 && oriented.every((e) => e.geomType === 'LINE')) {
            // A spatial quadrilateral has a natural bilinear patch: no filling overshoot.
            const opposite = oriented[2].flipOrientation() as unknown as Edge;
            const sides = [assembleWire([oriented[0]]), assembleWire([opposite])];
            try {
              face = loft(sides, { ruled: true }, true);
            } finally {
              sides.forEach((w) => w.delete());
              opposite.delete();
            }
          } else face = makeNonPlanarFace(wire);
          if (!shapeIsValid(face)) return empty;
          const body = bodyFromShape(
            { ...makeBody(1, 1, 0), name: `Kynäpinta ${bodies.length + 1}`, purpose: 'model' },
            face,
            [],
          );
          // Verify the saved representation too, before replacing any previous patch.
          const restored = createShape(body);
          restored.delete();
          const previous = related
            .filter((b) =>
              verts.every((p) =>
                p.every(
                  (n, i) =>
                    n >= b.origin[i] - 1e-4 &&
                    n <=
                      b.origin[i] + [b.feature.width, b.feature.depth, b.feature.height][i] + 1e-4,
                ),
              ),
            )
            .sort((a, b) => {
              const area = (body: Body) => {
                const { width: w, depth: d, height: h } = body.feature;
                return w * d + w * h + d * h;
              };
              return area(a) - area(b);
            })[0];
          if (previous) {
            body.color = previous.color;
            body.material = previous.material;
            body.appearance = previous.appearance;
          }
          body.penRegion = { owner: body.id, origin: body.origin, sources: networkIds };
          bodies.push(body);
        } catch {
          /* An ambiguous spatial loop remains a wire; never block continued drawing. */
          return empty;
        } finally {
          face?.delete();
          wire?.delete();
          oriented.forEach((e) => e.delete());
        }
      }
      if (!bodies.length) return empty;
      const replaceIds = previous
        .filter(
          (b) =>
            !b.locked &&
            b.penRegion?.owner === b.id &&
            b.origin.every((n, i) => Math.abs(n - b.penRegion!.origin[i]) < 1e-6) &&
            b.penRegion.sources.every((id) => networkIds.includes(id)),
        )
        .map((b) => b.id);
      return { bodies, replaceIds };
    } finally {
      sourceEdges.forEach((s) => s.edges.forEach((e) => e.delete()));
    }
  } finally {
    edges.forEach((e) => e.delete());
    result?.delete();
    splitter.delete();
    shapes.forEach((s) => s.delete());
  }
}
