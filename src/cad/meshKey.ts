import type { Body } from '../model/project';

/** Only geometry and placement affect the CAD mesh; names/materials/groups do not. */
export function bodyMeshKey(body: Body): string {
  return JSON.stringify([body.feature, body.origin, body.edgeTreatment, body.curveSnaps]);
}
