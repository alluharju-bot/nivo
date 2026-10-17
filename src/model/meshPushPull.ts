import { Vector3 } from 'three';
import type { Body, FaceRef, Vec3 } from './project';
import { meshBody } from '../exchange/mesh';
import { editableGeometry, geometryMeshBody, validateGeometry } from './geometryEditing';
import { retessellateGeometry } from './geometryRetessellation';

function meshFace(body: Body, ref: FaceRef) {
  if (body.feature.type !== 'mesh') throw new Error('Valitse verkkopinta.');
  const data = meshBody(body),
    face = data.faces.find((f) => f.ref === ref);
  if (!face?.planar)
    throw new Error(
      'Push/pull tarvitsee tasaisen pinnan. Muotoile kaarevaa pintaa geometrian muokkauksessa.',
    );
  return { data, face };
}
export function meshFaceSpan(body: Body, ref: FaceRef) {
  const { data, face } = meshFace(body, ref);
  const n = new Vector3(...face.normal),
    start = new Vector3(...face.center);
  let depth = 0;
  const values = body.feature.type === 'mesh' ? body.feature.vertices : data.vertices;
  const localStart = start.clone().sub(new Vector3(...body.origin));
  for (let i = 0; i < values.length; i += 3)
    depth = Math.max(
      depth,
      n.x * (localStart.x - values[i]) +
        n.y * (localStart.y - values[i + 1]) +
        n.z * (localStart.z - values[i + 2]),
    );
  return {
    start: start.toArray(),
    end: start.clone().addScaledVector(n, -depth).toArray(),
    depth,
    solid: body.feature.type === 'mesh' && body.feature.solid,
  };
}
/** Move a planar mesh cap with its welded boundary, preserving adjoining walls,
 * UV seams, material groups and topology. Validation rejects inverted/intersecting shells. */
export function pushPullMesh(body: Body, ref: FaceRef, distance: number): Body {
  if (body.locked) throw new Error('Vapauta osan lukitus ennen muokkaamista.');
  if (!Number.isFinite(distance)) throw new Error('Anna äärellinen mitta.');
  if (Math.abs(distance) < 1e-9) return body;
  const { data, face } = meshFace(body, ref);
  if (body.feature.type !== 'mesh' || !body.feature.solid)
    throw new Error(
      'Verkkopinnan push/pull tarvitsee suljetun osan. Avoimen verkon pisteitä ja reunoja voi siirtää geometrian muokkauksessa.',
    );
  // Preserve stored double precision instead of round-tripping world-space GPU floats.
  data.vertices = body.feature.vertices.map((n, i) => n + body.origin[i % 3]);
  const g = editableGeometry(body, data, false);
  const selected = new Set(
    data.triangles.slice(face.start, face.start + face.count).map((i) => g.vertexMap[i]),
  );
  const points = g.points.map((p, i) =>
    selected.has(i) ? (p.map((n, a) => n + face.normal[a] * distance) as Vec3) : p,
  );
  const draft = retessellateGeometry(g, points);
  validateGeometry(draft, points);
  return geometryMeshBody(body, draft, points);
}
