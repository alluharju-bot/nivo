import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { Vector3 } from 'three';
import { impactCutter } from './impact';
import type { SurfaceMesh } from '../surface/mesh';
import type { Fragment, FractureOptions, FractureResult } from './types';

/** Seeded splitting of closed volumes. Every split creates capped interior surfaces. */
export function fractureMesh(
  api: ManifoldToplevel,
  mesh: SurfaceMesh,
  options: FractureOptions,
  progress: (value: number) => void = () => {},
): FractureResult {
  if (!Number.isInteger(options.count) || options.count < 2 || options.count > 80)
    throw new Error('Valitse 2–80 palaa.');
  if (mesh.indices.length > 180000)
    throw new Error('Kevennä osa alle 60 000 kolmioon ennen rikkomista.');
  if (
    !Number.isFinite(options.seed) ||
    !Number.isFinite(options.irregularity) ||
    options.irregularity < 0 ||
    options.irregularity > 1
  )
    throw new Error('Rikkomisen asetukset eivät kelpaa.');
  const faceList = [...new Set(mesh.faces)].sort((a, b) => a - b);
  if (faceList.length > 900)
    throw new Error('Osassa on liian monta erillistä pintaa. Kevennä verkkoa ensin.');
  const firstID = api.Manifold.reserveIDs(faceList.length);
  const idToFace = new Map(faceList.map((face, i) => [firstID + i, face]));
  const interiorFace = Math.max(0, ...faceList) + 1;
  const numProp = mesh.uv ? 8 : 6;
  const properties = new Float32Array((mesh.positions.length / 3) * numProp);
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    properties.set(mesh.positions.slice(v * 3, v * 3 + 3), v * numProp);
    properties.set(mesh.normals.slice(v * 3, v * 3 + 3), v * numProp + 3);
    if (mesh.uv) properties.set(mesh.uv.slice(v * 2, v * 2 + 2), v * numProp + 6);
  }
  const order = mesh.faces.map((face, t) => ({ face, t })).sort((a, b) => a.face - b.face);
  const triVerts = new Uint32Array(order.flatMap(({ t }) => mesh.indices.slice(t * 3, t * 3 + 3)));
  const runIndex: number[] = [],
    runOriginalID: number[] = [];
  order.forEach(({ face }, t) => {
    if (!t || order[t - 1].face !== face) {
      runIndex.push(t * 3);
      runOriginalID.push(firstID + faceList.indexOf(face));
    }
  });
  runIndex.push(triVerts.length);
  const input = new api.Mesh({
    numProp,
    vertProperties: properties,
    triVerts,
    runIndex: new Uint32Array(runIndex),
    runOriginalID: new Uint32Array(runOriginalID),
  });
  input.merge();
  const allocated = new Set<Manifold>();
  const own = (m: Manifold) => {
    allocated.add(m);
    return m;
  };
  const release = (m: Manifold) => {
    m.delete();
    allocated.delete(m);
  };
  let seed = options.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    let source: Manifold;
    try {
      source = own(new api.Manifold(input));
    } catch {
      throw new Error(
        'Rikkominen tarvitsee suljetun, ehjän kappaleen. Avoin pinta ei vielä sovellu rikottavaksi.',
      );
    }
    if (source.status() !== 'NoError' || source.volume() <= 0)
      throw new Error('Rikkominen tarvitsee suljetun, ehjän kappaleen.');
    const sourceVolume = source.volume();
    let active = source;
    const fixed: Manifold[] = [];
    if (options.impact && options.region) throw new Error('Valitse vain yksi rikottava alue.');
    if (options.impact) {
      const cutter = impactCutter(mesh, options.impact, options.seed, options.irregularity);
      const tool = own(
        new api.Manifold(
          new api.Mesh({
            numProp: 3,
            vertProperties: new Float32Array(cutter.positions),
            triVerts: new Uint32Array(cutter.indices),
          }),
        ),
      );
      const [part, rest] = source.split(tool).map(own);
      active = part;
      if (!rest.isEmpty()) fixed.push(rest);
      if (part.isEmpty() || part.volume() < sourceVolume * 1e-8)
        throw new Error('Osumakohta ei leikkaa osaa. Poimi pinta uudelleen.');
    }
    if (options.region) {
      const { normal, offset } = options.region;
      if (![...normal, offset].every(Number.isFinite) || new Vector3(...normal).length() < 0.99)
        throw new Error('Valitse rikottava pääty uudelleen.');
      const [part, rest] = source.splitByPlane(normal, offset).map(own);
      active = part;
      if (!rest.isEmpty()) fixed.push(rest);
      if (part.isEmpty() || part.volume() < sourceVolume * 1e-8)
        throw new Error('Rajaus ei osu osaan. Suurenna rikottavan päädyn syvyyttä.');
    }
    const pieces = active.decompose().map(own);
    if (pieces.length > options.count)
      throw new Error(
        'Osassa on jo enemmän irrallisia paloja kuin valittu määrä. Kasvata palamäärää.',
      );
    const retainCount =
      fixed.length && options.region && options.ragged
        ? Math.max(1, Math.floor(options.count / 4))
        : 0;
    const targetCount = options.count + retainCount;
    let attempts = 0;
    const blocked = new Set<Manifold>();
    while (pieces.length < targetCount && attempts++ < targetCount * 12) {
      const candidate = pieces
        .filter((p) => !blocked.has(p))
        .sort((a, b) => b.volume() - a.volume())[0];
      if (!candidate) break;
      const box = candidate.boundingBox();
      const size = box.max.map((n, a) => n - box.min[a]);
      const axis = size.indexOf(Math.max(...size));
      const normal = new Vector3().setComponent(axis, 1);
      for (let a = 0; a < 3; a++)
        if (a !== axis) normal.setComponent(a, (random() - 0.5) * 1.6 * options.irregularity);
      normal.normalize();
      const center = new Vector3(...box.min).add(new Vector3(...box.max)).multiplyScalar(0.5);
      center.setComponent(
        axis,
        center.getComponent(axis) + (random() - 0.5) * size[axis] * 0.45 * options.irregularity,
      );
      const halves = candidate.splitByPlane(normal.toArray(), normal.dot(center)).map(own);
      if (halves.some((h) => h.isEmpty() || h.volume() < candidate.volume() * 0.04)) {
        halves.forEach(release);
        if (attempts > options.count * 8) blocked.add(candidate);
        continue;
      }
      const children = halves.flatMap((h) => h.decompose().map(own));
      if (pieces.length - 1 + children.length > 100) {
        children.forEach(release);
        halves.forEach(release);
        blocked.add(candidate);
        continue;
      }
      pieces.splice(pieces.indexOf(candidate), 1, ...children);
      halves.forEach(release);
      if (candidate !== source && candidate !== active) release(candidate);
      progress(pieces.length / targetCount);
    }
    if (pieces.length < 2)
      throw new Error('Osaa ei saatu jaettua ehjiksi paloiksi. Kokeile toista rajausta.');
    if (retainCount && options.region) {
      const n = new Vector3(...options.region.normal),
        offset = options.region.offset;
      const attached = pieces
        .filter((p) => {
          const m = p.getMesh();
          for (let i = 0; i < m.vertProperties.length; i += m.numProp)
            if (Math.abs(n.dot(new Vector3().fromArray(m.vertProperties, i)) - offset) < 0.02)
              return true;
          return false;
        })
        .sort((a, b) => {
          const center = (p: Manifold) => {
            const b = p.boundingBox();
            return new Vector3(...b.min).add(new Vector3(...b.max)).multiplyScalar(0.5);
          };
          return n.dot(center(a)) - n.dot(center(b));
        })
        .slice(0, Math.min(retainCount, pieces.length - 2));
      if (attached.length) {
        const remainder = own(api.Manifold.union([...fixed, ...attached]));
        if (remainder.status() !== 'NoError')
          throw new Error(
            'Murtoreunaa ei saatu yhdistettyä ehjäksi. Poista rosoinen murtoreuna käytöstä.',
          );
        fixed.splice(0, fixed.length, remainder);
        for (const piece of attached) pieces.splice(pieces.indexOf(piece), 1);
      }
    }
    const read = (solid: Manifold, isFixed: boolean): Fragment => {
      const result = solid.getMesh();
      const out: SurfaceMesh = {
        positions: [],
        normals: [],
        indices: [],
        faces: [],
        uv: mesh.uv ? [] : undefined,
      };
      for (let run = 0; run < result.runOriginalID.length; run++) {
        const face = idToFace.get(result.runOriginalID[run]) ?? interiorFace;
        for (let t = result.runIndex[run]; t < result.runIndex[run + 1]; t += 3) {
          const points = [0, 1, 2].map((k) =>
            new Vector3().fromArray(result.vertProperties, result.triVerts[t + k] * result.numProp),
          );
          const flat = points[1]
            .clone()
            .sub(points[0])
            .cross(points[2].clone().sub(points[0]))
            .normalize();
          for (let k = 0; k < 3; k++) {
            const v = result.triVerts[t + k] * result.numProp;
            out.indices.push(out.positions.length / 3);
            out.positions.push(...points[k].toArray());
            const n =
              face === interiorFace
                ? flat
                : new Vector3().fromArray(result.vertProperties, v + 3).normalize();
            out.normals.push(...(n.lengthSq() > 0.5 ? n : flat).toArray());
            if (out.uv)
              out.uv.push(result.vertProperties[v + 6] || 0, result.vertProperties[v + 7] || 0);
          }
          out.faces.push(face);
        }
      }
      const hull = own(api.Manifold.hull([solid]));
      const convex = hull.volume() <= solid.volume() * 1.000001;
      release(hull);
      return { mesh: out, fixed: isFixed, volume: solid.volume(), convex };
    };
    const fragments = [...fixed.map((p) => read(p, true)), ...pieces.map((p) => read(p, false))];
    const volume = fragments.reduce((n, p) => n + p.volume, 0);
    if (Math.abs(volume - sourceVolume) > sourceVolume * 0.001)
      throw new Error('Rikkominen muutti osan tilavuutta liikaa. Muutos peruttiin.');
    return { fragments, interiorFace, sourceVolume };
  } finally {
    for (const solid of allocated) solid.delete();
  }
}
