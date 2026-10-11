import { Quaternion, Vector3 } from 'three';
import type { Body, Vec3 } from './project';
import type { BodyMesh } from '../cad/protocol';
import { cutGeometryKey, rectangularCutFrame } from './cutting';
import type { QuantityBasis } from './quantitySchema';
import { dot, unit } from './geometry';

export function quantityBasis(body: Body, mesh?: BodyMesh): QuantityBasis | undefined {
  const key = cutGeometryKey(body);
  if (body.quantityBasis?.geometryKey === key) return body.quantityBasis;
  // A user's stock allowance must never silently turn into a geometric dimension.
  if (body.quantityBasis?.manual) return;
  const rectangular = rectangularCutFrame(body, mesh);
  if (rectangular) return { ...rectangular, geometryKey: key };
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
  return {
    ...basis,
    axes,
    dimensions: basis.dimensions.map((d, i) => d * Math.hypot(...vectors[i])) as Vec3,
    geometryKey: cutGeometryKey(result),
  };
}
