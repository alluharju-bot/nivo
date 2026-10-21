import { Matrix4, Quaternion, Vector3 } from 'three';
import { bodySchema, uid, type Body, type Project } from '../model/project';
import { bodyVisible } from '../model/transforms';
import { bodyLocked } from '../model/groups';
import { defaultAppearance } from '../model/materials';
import { surfaceBody, meshBounds } from '../surface/mesh';
import { transformMesh } from '../exchange/mesh';
import type { BodyMesh } from '../cad/protocol';
import type { FractureResult, Obstacle, Pose } from './types';

export function restPoses(result: FractureResult): Pose[] {
  return result.fragments.map((p) => ({
    position: meshBounds(p.mesh).center,
    rotation: [0, 0, 0, 1],
  }));
}
export function fragmentBodies(
  source: Body,
  result: FractureResult,
  poses: Pose[],
  interiorColor: string,
  keepLoose: boolean,
): Body[] {
  if (
    poses.length !== result.fragments.length ||
    poses.some((p) => ![...p.position, ...p.rotation].every(Number.isFinite))
  )
    throw new Error('Simulaation asento ei kelpaa. Palauta palat lähtöasentoon.');
  const materialSource: Body = {
    ...source,
    faceMaterials: {
      ...source.faceMaterials,
      [result.interiorFace]: { color: interiorColor, appearance: defaultAppearance('matte') },
    },
  };
  return result.fragments.flatMap((fragment, i) => {
    if (!keepLoose && !fragment.fixed) return [];
    let body = surfaceBody(materialSource, fragment.mesh);
    body = bodySchema.parse({
      ...body,
      name: `${source.name.slice(0, 90)} · ${fragment.fixed ? 'jäännös' : `pala ${i + 1}`}`,
      partTypeId: undefined,
      product: undefined,
      purpose: 'model',
    });
    const center = new Vector3(...meshBounds(fragment.mesh).center).add(
      new Vector3(...source.origin),
    );
    const destination = new Vector3(...poses[i].position).add(new Vector3(...source.origin));
    const matrix = new Matrix4()
      .compose(destination, new Quaternion(...poses[i].rotation), new Vector3(1, 1, 1))
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    return [transformMesh(body, matrix)];
  });
}
export function insertFragments(project: Project, source: Body, bodies: Body[]) {
  const current = project.bodies.find((b) => b.id === source.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(source))
    throw new Error('Alkuperäinen osa on muuttunut. Avaa rikkominen uudelleen.');
  if (bodyLocked(current, project.groups))
    throw new Error('Vapauta osan tai ryhmän lukitus ensin.');
  if (!bodies.length) throw new Error('Hyväksyttäväksi ei jää osia. Rajaa ensin rikottava pääty.');
  const group = {
    id: uid(),
    name: `${source.name.slice(0, 100)} · rikottu`,
    parentId: source.groupId,
    hidden: false,
    kind: 'folder' as const,
  };
  return {
    group,
    bodies: bodies.map((b) => ({ ...b, groupId: group.id })),
    project: {
      ...project,
      groups: [...project.groups, group],
      bodies: [
        ...project.bodies.map((b) => (b.id === source.id ? { ...b, hidden: true } : b)),
        ...bodies.map((b) => ({ ...b, groupId: group.id })),
      ],
    },
  };
}
/** Only nearby, visible scene geometry enters the physics world. Never truncate colliders silently. */
export function fractureObstacles(source: Body, meshes: BodyMesh[], project: Project): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const sourceMesh = meshes.find((m) => m.id === source.id);
  if (!sourceMesh) return obstacles;
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  sourceMesh.vertices.forEach((n, i) => {
    min[i % 3] = Math.min(min[i % 3], n);
    max[i % 3] = Math.max(max[i % 3], n);
  });
  let triangles = 0;
  for (const mesh of meshes) {
    const body = project.bodies.find((b) => b.id === mesh.id);
    if (
      !body ||
      body.id === source.id ||
      !bodyVisible(body, project.groups) ||
      body.purpose === 'construction' ||
      body.purpose === 'drawing'
    )
      continue;
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    mesh.vertices.forEach((n, i) => {
      lo[i % 3] = Math.min(lo[i % 3], n);
      hi[i % 3] = Math.max(hi[i % 3], n);
    });
    if ([0, 1].some((a) => hi[a] < min[a] - 4000 || lo[a] > max[a] + 4000) || lo[2] > max[2] + 4000)
      continue;
    triangles += mesh.triangles.length / 3;
    if (triangles > 150000)
      throw new Error(
        'Lähistöllä on yli 150 000 törmäyskolmiota. Piilota tarpeettomia osia ennen simulointia.',
      );
    obstacles.push({
      vertices: mesh.vertices.map((n, i) => n - source.origin[i % 3]),
      triangles: mesh.triangles,
    });
  }
  return obstacles;
}
