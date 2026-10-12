import { Quaternion, Vector3 } from 'three';
import type { Body, Project, Vec3 } from './project';
import type { BodyMesh } from '../cad/protocol';
import { cutGeometryKey, rectangularCutFrame } from './cutting';
import type { QuantityBasis } from './quantitySchema';
import { dot, sub, unit } from './geometry';
import { cross, frameV, profileBounds } from './sketch';

/** Length is always the longest stock dimension. Keep its direction paired. */
export function orderedQuantityBasis<T extends QuantityBasis>(basis: T): T {
  if (basis.axes?.some((v) => v.some((n) => Object.is(n, -0))))
    basis = {
      ...basis,
      axes: basis.axes.map((v) => v.map((n) => (n === 0 ? 0 : n))) as [Vec3, Vec3, Vec3],
    };
  const order = [0, 1, 2].sort((a, b) => basis.dimensions[b] - basis.dimensions[a]);
  if (order.every((n, i) => n === i)) return basis;
  return {
    ...basis,
    dimensions: order.map((i) => basis.dimensions[i]) as Vec3,
    axes: basis.axes && (order.map((i) => basis.axes![i]) as [Vec3, Vec3, Vec3]),
  };
}

export function stockAxes(body: Body): [Vec3, Vec3, Vec3] {
  if (body.quantityBasis?.axes) return body.quantityBasis.axes;
  if (body.feature.type === 'profile-extrusion') {
    const { u, normal } = body.feature.frame;
    return [u, frameV(body.feature.frame), normal];
  }
  if (body.feature.type === 'planar-polygon') {
    const points = body.feature.points;
    const edges = points
      .map((p, i) => sub(points[(i + 1) % points.length], p))
      .sort((a, b) => Math.hypot(...b) - Math.hypot(...a));
    const u = unit(edges[0]);
    const side = edges.find((e) => Math.hypot(...cross(u, e)) > 1e-7)!;
    const n = unit(cross(u, side));
    return [u, cross(n, u), n];
  }
  const q = new Quaternion(
    ...(body.textureFrame?.rotation ?? body.component?.rotation ?? [0, 0, 0, 1]),
  ).normalize();
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((v) => new Vector3(...v).applyQuaternion(q).toArray()) as [Vec3, Vec3, Vec3];
}

export function quantityBasis(body: Body, mesh?: BodyMesh): QuantityBasis | undefined {
  const key = cutGeometryKey(body);
  if (body.quantityBasis?.geometryKey === key) return orderedQuantityBasis(body.quantityBasis);
  if (
    body.quantityBasis &&
    body.edgeTreatment &&
    body.quantityBasis.geometryKey ===
      cutGeometryKey({ ...body, feature: body.edgeTreatment.source })
  )
    return orderedQuantityBasis({ ...body.quantityBasis, geometryKey: key });
  // A user's stock allowance must never silently turn into a geometric dimension.
  if (body.quantityBasis?.manual) return;
  if (mesh?.stock) return orderedQuantityBasis({ ...mesh.stock, geometryKey: key });
  const rectangular = rectangularCutFrame(body, mesh);
  if (rectangular) return { ...rectangular, geometryKey: key };
  const feature = body.feature;
  if (feature.type === 'polygon-extrusion')
    return orderedQuantityBasis({
      dimensions: [feature.width, feature.depth, feature.height],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      geometryKey: key,
    });
  if (feature.type === 'profile-extrusion') {
    const box = profileBounds(
      feature.profile,
      { origin: [0, 0, 0], u: [1, 0, 0], normal: [0, 0, 1] },
      feature.distance,
    );
    return orderedQuantityBasis({
      dimensions: box.max.map((n, i) => n - box.min[i]) as Vec3,
      axes: [feature.frame.u, frameV(feature.frame), feature.frame.normal],
      geometryKey: key,
    });
  }
  if (feature.type === 'planar-polygon') {
    const axes = stockAxes({ ...body, quantityBasis: undefined });
    return orderedQuantityBasis({
      axes,
      geometryKey: key,
      dimensions: axes.map((axis) => {
        const values = feature.points.map((p) => dot(p, axis));
        return Math.max(...values) - Math.min(...values);
      }) as Vec3,
    });
  }
  const detail = body.edgeTreatment;
  if (detail?.source.type === 'rectangle-extrusion') {
    const source = rectangularCutFrame({ ...body, feature: detail.source })!;
    const q = new Quaternion(...detail.rotation).normalize();
    return {
      ...source,
      axes: source.axes.map((v) => new Vector3(...v).applyQuaternion(q).toArray()) as [
        Vec3,
        Vec3,
        Vec3,
      ],
      geometryKey: key,
    };
  }
}

/** Capture computed dimensions on creation/load, without creating a history action.
 * Manual allowances remain explicit; legacy length-only entries that equal the
 * geometry can return to automatic measurement, including their missing axes. */
export function captureQuantityBases(project: Project, meshes: BodyMesh[]): Project {
  const byId = new Map(meshes.map((m) => [m.id, m]));
  let changed = false;
  const bodies = project.bodies.map((body) => {
    const mesh = byId.get(body.id);
    let basis = quantityBasis(body, mesh);
    const old = body.quantityBasis;
    if (
      old?.manual &&
      old.dimensions.some((n) => n === 0) &&
      old.geometryKey === cutGeometryKey(body)
    ) {
      const automatic = quantityBasis({ ...body, quantityBasis: undefined }, mesh);
      if (
        automatic &&
        old.dimensions.every((n, i) => !n || Math.abs(n - automatic.dimensions[i]) < 1e-4)
      )
        basis = automatic;
    }
    if (!basis || JSON.stringify(old) === JSON.stringify(basis)) return body;
    changed = true;
    return { ...body, quantityBasis: basis };
  });
  return changed ? { ...project, bodies } : project;
}

/** Only an explicit rigid transform can revalidate an existing measurement. */
export function transformQuantityBasis(
  source: Body,
  result: Body,
  vector: (v: Vec3) => Vec3,
  uniformFactor = 1,
) {
  const basis = quantityBasis(source);
  if (!basis) return source.quantityBasis;
  if (!basis.axes) {
    if (!Number.isFinite(uniformFactor)) return basis; // unknown manual orientation
    return {
      ...basis,
      dimensions: basis.dimensions.map((d) => d * uniformFactor) as Vec3,
      geometryKey: cutGeometryKey(result),
    };
  }
  const vectors = basis.axes.map(vector);
  const axes = vectors.map(unit) as [Vec3, Vec3, Vec3];
  // Sheared stock has no orthogonal length × width. Require an explicit blank.
  if (axes.some((a, i) => axes.slice(i + 1).some((b) => Math.abs(dot(a, b)) > 1e-7))) return basis;
  return orderedQuantityBasis({
    ...basis,
    axes,
    dimensions: basis.dimensions.map((d, i) => d * Math.hypot(...vectors[i])) as Vec3,
    geometryKey: cutGeometryKey(result),
  });
}
