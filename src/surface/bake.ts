import { DoubleSide, Ray, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { geometryOf, type SurfaceMesh } from './mesh';
import { blankMap, dilateMaps, interpolate, rasterTriangle, type SurfaceMaps } from './maps';

export interface SampleTexture {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  matrix: number[];
  flipY: boolean;
  wrapS: number;
  wrapT: number;
  srgb: boolean;
}
export interface SampleMaterial {
  color: number[];
  roughness: number;
  metalness: number;
  normalScale: number[];
  map?: SampleTexture;
  normalMap?: SampleTexture;
  roughnessMap?: SampleTexture;
  metalnessMap?: SampleTexture;
}
export interface BakeSource {
  mesh: SurfaceMesh;
  materials: Record<number, SampleMaterial>;
}
export interface BakeOptions {
  size: number;
  cage: number;
  aoDistance: number;
  samples: number;
  details: boolean;
  /** UV remapping preserves triangles, so transfer their own material without a ray. */
  correspondence?: boolean;
}
export interface BakeResult {
  maps: SurfaceMaps;
  missed: number;
  covered: number;
}
const linear = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
const srgb = (n: number) =>
  n <= 0.0031308 ? n * 12.92 : 1.055 * Math.max(0, n) ** (1 / 2.4) - 0.055;
function transformedUV(uv: number[], texture: SampleTexture) {
  const m = texture.matrix;
  return [m[0] * uv[0] + m[3] * uv[1] + m[6], m[1] * uv[0] + m[4] * uv[1] + m[7]];
}
function sample(texture: SampleTexture | undefined, uv: number[], fallback: number[]) {
  if (!texture) return fallback;
  let [u, v] = transformedUV(uv, texture);
  const wrap = (n: number, mode: number) =>
    mode === 1000
      ? n - Math.floor(n)
      : mode === 1002
        ? 1 - Math.abs((((n % 2) + 2) % 2) - 1)
        : Math.min(1, Math.max(0, n));
  u = wrap(u, texture.wrapS);
  v = wrap(v, texture.wrapT);
  if (texture.flipY) v = 1 - v;
  const x = Math.min(texture.width - 1, Math.max(0, Math.floor(u * texture.width))),
    y = Math.min(texture.height - 1, Math.max(0, Math.floor(v * texture.height))),
    offset = (y * texture.width + x) * 4;
  return [0, 1, 2].map((k) => {
    const n = texture.pixels[offset + k] / 255;
    return texture.srgb ? linear(n) : n;
  });
}
export function tangentFrame(
  mesh: SurfaceMesh,
  ids: number[],
  normal: Vector3,
  texture?: SampleTexture,
) {
  const [a, b, c] = ids.map((i) => new Vector3().fromArray(mesh.positions, i * 3));
  const coords = ids.map((i) => mesh.uv?.slice(i * 2, i * 2 + 2) ?? [0, 0]);
  const [u, v, w] = texture ? coords.map((uv) => transformedUV(uv, texture)) : coords;
  const e1 = b.sub(a),
    e2 = c.sub(a),
    du1 = v[0] - u[0],
    dv1 = v[1] - u[1],
    du2 = w[0] - u[0],
    dv2 = w[1] - u[1],
    det = du1 * dv2 - dv1 * du2;
  let tangent: Vector3,
    sign = 1;
  if (Math.abs(det) > 1e-12) {
    tangent = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
    const bitangent = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
    sign = new Vector3().crossVectors(normal, tangent).dot(bitangent) < 0 ? -1 : 1;
  } else
    tangent =
      Math.abs(normal.z) < 0.9
        ? new Vector3(0, 0, 1).cross(normal)
        : new Vector3(0, 1, 0).cross(normal);
  tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
  return {
    tangent,
    bitangent: new Vector3().crossVectors(normal, tangent).normalize().multiplyScalar(sign),
  };
}
/** CPU BVH baking runs in a dedicated, cancellable worker; no render-thread GPU allocation. */
export function bakeSurface(
  target: SurfaceMesh,
  source: BakeSource,
  options: BakeOptions,
  progress = (value: number) => {
    void value;
  },
): BakeResult {
  if (!target.uv) throw new Error('Luo UV-kartta ennen pintakarttojen laskentaa.');
  const { size, cage, aoDistance, samples, details } = options;
  if (
    ![128, 256, 512, 1024].includes(size) ||
    !Number.isFinite(cage) ||
    cage <= 0 ||
    !Number.isFinite(aoDistance) ||
    aoDistance <= 0 ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 64
  )
    throw new Error('Tarkista pintakarttojen asetukset.');
  const maps: SurfaceMaps = {
    color: blankMap(size, [200, 200, 200]),
    normal: blankMap(size, [128, 128, 255]),
    roughness: blankMap(size, [180, 180, 180]),
    metalness: blankMap(size, [0, 0, 0]),
  };
  if (details) maps.ao = blankMap(size, [255, 255, 255]);
  const high = source.mesh,
    geometry = geometryOf(high),
    bvh = new MeshBVH(geometry, { indirect: true }),
    mask = new Uint8Array(size * size);
  const triangleKey = (mesh: SurfaceMesh, t: number) =>
    mesh.indices
      .slice(t * 3, t * 3 + 3)
      .map((i) =>
        [...mesh.positions.slice(i * 3, i * 3 + 3), ...mesh.normals.slice(i * 3, i * 3 + 3)]
          .map((n) => n.toPrecision(12))
          .join(','),
      )
      .sort()
      .join('|');
  const correspondence = options.correspondence
    ? new Map(Array.from({ length: high.indices.length / 3 }, (_, t) => [triangleKey(high, t), t]))
    : undefined;
  const ray = new Ray(),
    triangle = new Triangle(),
    bary = new Vector3();
  let missed = 0,
    covered = 0,
    last = 0;
  const epsilon = Math.max(0.00001, aoDistance * 1e-5);
  try {
    for (let t = 0; t < target.indices.length / 3; t++) {
      const ids = target.indices.slice(t * 3, t * 3 + 3);
      const correspondingFace = correspondence?.get(triangleKey(target, t));
      rasterTriangle(target, t, size, (pixel, w) => {
        if (mask[pixel]) return;
        mask[pixel] = 1;
        covered++;
        const p = new Vector3(...interpolate(target.positions, ids, w)),
          normal = new Vector3(...interpolate(target.normals, ids, w)).normalize();
        ray.origin.copy(p).addScaledVector(normal, cage);
        ray.direction.copy(normal).negate();
        const hit =
          correspondingFace === undefined
            ? bvh.raycastFirst(ray, DoubleSide, 0, cage * 2 + epsilon)
            : null;
        const nearest =
          hit || correspondingFace !== undefined
            ? undefined
            : bvh.closestPointToPoint(p, undefined, 0, cage);
        const face = correspondingFace ?? hit?.faceIndex ?? nearest?.faceIndex,
          point = correspondingFace !== undefined ? p : (hit?.point ?? nearest?.point);
        if (
          face === undefined ||
          face === null ||
          !point ||
          (!hit && nearest && nearest.distance > cage)
        ) {
          missed++;
          return;
        }
        const sourceIds = high.indices.slice(face * 3, face * 3 + 3);
        triangle.set(
          ...(sourceIds.map((i) => new Vector3().fromArray(high.positions, i * 3)) as [
            Vector3,
            Vector3,
            Vector3,
          ]),
        );
        triangle.getBarycoord(point, bary);
        const weights = bary.toArray(),
          highNormal = new Vector3(...interpolate(high.normals, sourceIds, weights)).normalize();
        const uv = high.uv ? interpolate(high.uv, sourceIds, weights, 2) : [0, 0];
        const material = source.materials[high.faces[face]] ?? Object.values(source.materials)[0];
        const color = sample(material.map, uv, [1, 1, 1]).map((n, k) =>
          Math.round(Math.min(1, Math.max(0, srgb(n * material.color[k]))) * 255),
        );
        const rough = sample(material.roughnessMap, uv, [1, 1, 1])[1] * material.roughness * 255;
        const metal = sample(material.metalnessMap, uv, [1, 1, 1])[2] * material.metalness * 255;
        maps.color!.pixels.set([...color, 255], pixel * 4);
        maps.roughness!.pixels.set([rough, rough, rough, 255], pixel * 4);
        maps.metalness!.pixels.set([metal, metal, metal, 255], pixel * 4);
        const geometricNormal = highNormal.clone();
        if (material.normalMap) {
          const value = sample(material.normalMap, uv, [0.5, 0.5, 1]),
            frame = tangentFrame(high, sourceIds, highNormal, material.normalMap);
          highNormal
            .multiplyScalar(value[2] * 2 - 1)
            .addScaledVector(frame.tangent, (value[0] * 2 - 1) * material.normalScale[0])
            .addScaledVector(frame.bitangent, (value[1] * 2 - 1) * material.normalScale[1])
            .normalize();
        }
        const frame = tangentFrame(target, ids, normal);
        const mapped = [
          highNormal.dot(frame.tangent),
          highNormal.dot(frame.bitangent),
          highNormal.dot(normal),
        ].map((n) => (n * 0.5 + 0.5) * 255);
        maps.normal!.pixels.set([...mapped, 255], pixel * 4);
        if (details) {
          const tangent =
            Math.abs(geometricNormal.z) < 0.9
              ? new Vector3(0, 0, 1).cross(geometricNormal).normalize()
              : new Vector3(0, 1, 0).cross(geometricNormal).normalize();
          const bitangent = new Vector3().crossVectors(geometricNormal, tangent);
          let blocked = 0;
          // Deterministic cosine-weighted hemisphere; per-pixel rotation avoids bands.
          const rotation = ((Math.imul(pixel + 1, 1597334677) >>> 0) / 4294967296) * Math.PI * 2;
          for (let s = 0; s < samples; s++) {
            const r = Math.sqrt((s + 0.5) / samples),
              angle = s * 2.399963229728653 + rotation;
            ray.origin.copy(point).addScaledVector(geometricNormal, epsilon);
            ray.direction
              .copy(geometricNormal)
              .multiplyScalar(Math.sqrt(1 - r * r))
              .addScaledVector(tangent, r * Math.cos(angle))
              .addScaledVector(bitangent, r * Math.sin(angle))
              .normalize();
            if (bvh.raycastFirst(ray, DoubleSide, epsilon, aoDistance)) blocked++;
          }
          const ao = 255 * (1 - blocked / samples);
          maps.ao!.pixels.set([ao, ao, ao, 255], pixel * 4);
        }
      });
      if (performance.now() - last > 80) {
        progress((t + 1) / (target.indices.length / 3));
        last = performance.now();
      }
    }
    if (!covered) throw new Error('UV-kartasta ei löytynyt piirrettäviä pintoja.');
    if (missed > covered * 0.05)
      throw new Error(
        `${Math.round((missed / covered) * 100)} % pinnasta ei tavoita lähdemallia. Suurenna hakumatkaa tai tarkista mallien kohdistus.`,
      );
    dilateMaps(maps, mask, 4);
    progress(1);
    return { maps, missed, covered };
  } finally {
    geometry.dispose();
  }
}
