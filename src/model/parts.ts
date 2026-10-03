import { bounds, featureIsSolid, type Body, type Project, type Vec3 } from './project';
import { groupBodies, groupPath } from './groups';
import { findPreset } from './materials';
import type { BodyMesh } from '../cad/protocol';

export function assemblyParts(project: Project, target = 'all') {
  const bodies = target === 'all' ? project.bodies : groupBodies(project, target);
  return bodies.filter(
    (b) => ['model', 'component'].includes(b.purpose) && featureIsSolid(b.feature),
  );
}
export function partRows(project: Project, bodies: Body[]) {
  return bodies.map((body, i) => ({
    number: i + 1,
    id: body.id,
    name: body.name,
    group: groupPath(project.groups, body.groupId),
    width: body.feature.width,
    depth: body.feature.depth,
    height: body.feature.height,
    material: findPreset(body.appearance?.preset ?? body.material ?? 'matte').name,
  }));
}
const csvCell = (value: string | number) => {
  const text = String(value);
  // User-controlled names must remain text in spreadsheet applications.
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
};
export function partsCSV(project: Project, bodies: Body[]) {
  return (
    '\uFEFF' +
    [
      [
        'Nro',
        'Osa',
        'Ryhmä',
        'Määrä',
        'Ulkomitta X (mm)',
        'Ulkomitta Y (mm)',
        'Ulkomitta Z (mm)',
        'Materiaali',
      ],
      ...partRows(project, bodies).map((r) => [
        r.number,
        r.name,
        r.group,
        1,
        r.width,
        r.depth,
        r.height,
        r.material,
      ]),
    ]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n')
  );
}
/** Visual-only expansion. Source geometry, dimensions, groups and undo remain untouched. */
export function explodeParts(bodies: Body[], meshes: BodyMesh[], amount: number) {
  const box = bounds(bodies),
    center = box.min.map((v, i) => (v + box.max[i]) / 2);
  const offsets = new Map<string, Vec3>();
  bodies.forEach((body) => {
    const size = [body.feature.width, body.feature.depth, body.feature.height];
    // Homothetic expansion of part centres. Preserve every radial component:
    // rear upper/lower rails must move backwards AND up/down. A centred part
    // stays at the centre while its neighbours separate, independent of list order.
    const offset = body.origin.map(
      (v, i) => (v + size[i] / 2 - center[i]) * Math.max(0, amount),
    ) as Vec3;
    offsets.set(body.id, offset);
  });
  return {
    bodies: bodies.map((body) => ({
      ...body,
      origin: body.origin.map((v, i) => v + offsets.get(body.id)![i]) as Vec3,
    })),
    meshes: meshes
      .filter((mesh) => offsets.has(mesh.id))
      .map((mesh) => {
        const d = offsets.get(mesh.id)!;
        // The presentation renderer uses triangles/normals; picking follows the shifted mesh.
        return { ...mesh, vertices: mesh.vertices.map((v, i) => v + d[i % 3]) };
      }),
  };
}
