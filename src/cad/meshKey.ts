import type { Body } from '../model/project';

// Project bodies/features are immutable. Do not stringify multi-megabyte BReps
// again for every placement/material/selection update. Keys remain collision-free.
const features = new WeakMap<Body['feature'], string>();
const geometries = new WeakMap<Body, string>();
const placements = new WeakMap<Body, string>();
export function bodyGeometryKey(body: Body): string {
  let key = geometries.get(body);
  if (key === undefined) {
    let feature = features.get(body.feature);
    if (feature === undefined) {
      feature = JSON.stringify(body.feature);
      features.set(body.feature, feature);
    }
    key = `[${feature},${JSON.stringify(body.edgeTreatment) ?? 'null'},${JSON.stringify(body.curveSnaps) ?? 'null'}]`;
    geometries.set(body, key);
  }
  return key;
}

/** Only geometry and placement affect the CAD mesh; names/materials/groups do not. */
export function bodyMeshKey(body: Body): string {
  let key = placements.get(body);
  if (key === undefined) {
    key = `${bodyGeometryKey(body)}:${JSON.stringify(body.origin)}`;
    placements.set(body, key);
  }
  return key;
}
