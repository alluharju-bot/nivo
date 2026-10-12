import { Quaternion, Vector3 } from 'three';
import type { Body } from './project';
import type { BodyMesh, EdgeDetailTarget } from '../cad/protocol';

/** Linked copies edit one definition. Map selected edges into that definition
 * instead of independently replacing several instances with conflicting shapes. */
export function edgeDetailRequests(
  bodies: Body[],
  meshes: BodyMesh[],
  targets: EdgeDetailTarget[],
) {
  const requests: { body: Body; indices: number[]; editing?: boolean }[] = [];
  const signature = (body: Body, lines: number[]) => {
    const frame = body.component!,
      q = new Quaternion(...frame.rotation).normalize().invert();
    const origin = new Vector3(...body.origin).add(new Vector3(...frame.offset));
    const points = new Set<string>();
    for (let i = 0; i < lines.length; i += 3)
      points.add(
        new Vector3(lines[i], lines[i + 1], lines[i + 2])
          .sub(origin)
          .applyQuaternion(q)
          .toArray()
          .map((n) => Math.round(n * 1e4))
          .join(','),
      );
    return [...points].sort().join(';');
  };
  const edges = (body: Body, editing?: boolean) => {
    const mesh = meshes.find((m) => m.id === body.id);
    return (editing ? mesh?.sourceDetailEdges : undefined) ?? mesh?.detailEdges ?? [];
  };
  for (const target of targets) {
    if (!target.indices.length) continue;
    const body = bodies.find((b) => b.id === target.bodyId);
    if (!body) continue;
    const earlier =
      body.component && requests.find((r) => r.body.component?.id === body.component!.id);
    if (!earlier) {
      requests.push({ body, indices: [...target.indices], editing: target.editing });
      continue;
    }
    if (!!earlier.editing !== !!target.editing)
      return { requests: [], error: 'Valitse linkitetyille kopioille sama käsittelyvaihe.' };
    const sourceEdges = new Map(
      edges(earlier.body, earlier.editing).map((edge) => [
        signature(earlier.body, edge.lines),
        edge.index,
      ]),
    );
    for (const index of target.indices) {
      const edge = edges(body, target.editing).find((e) => e.index === index);
      const matched = edge && sourceEdges.get(signature(body, edge.lines));
      if (matched === undefined)
        return {
          requests: [],
          error:
            'Kopioiden reunat eivät vastaa toisiaan. Valitse reunat yhdestä linkitetystä kopiosta; muutos välittyy muihin.',
        };
      if (!earlier.indices.includes(matched)) earlier.indices.push(matched);
    }
  }
  return { requests, error: undefined };
}
