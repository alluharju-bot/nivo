import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LoadingManager,
  Matrix4,
  Mesh,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
} from 'three';
import {
  bodySchema,
  freshProject,
  projectSchema,
  uid,
  type Body,
  type Project,
  type Vec3,
} from '../model/project';
import {
  defaultAppearance,
  textureDefaults,
  type TextureAsset,
  type TexturePlacement,
} from '../model/materials';
import { meshClosure } from './mesh';

export type ImportOptions = { unit: 'mm' | 'cm' | 'm' | 'inch'; up: 'z' | 'y' };
export const importScale = { mm: 1, cm: 10, m: 1000, inch: 25.4 };
export function importDefaults(name: string): ImportOptions {
  return /\.gl(?:b|tf)$/i.test(name) ? { unit: 'm', up: 'y' } : { unit: 'mm', up: 'z' };
}
function bodyFromGeometry(geometry: BufferGeometry, name: string): Body {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  if (box.isEmpty()) throw new Error('Tiedoston geometria on tyhjä.');
  const origin = box.min.toArray() as Vec3,
    size = box.max.clone().sub(box.min).toArray();
  if (
    [...origin, ...box.max.toArray()].some((n) => !Number.isFinite(n) || Math.abs(n) > 100000) ||
    size.some((n) => n > 100000)
  )
    throw new Error(
      'Tuodun mallin mitta tai sijainti ylittää 100 000 mm. Tarkista tuonnin yksikkö.',
    );
  geometry.translate(-origin[0], -origin[1], -origin[2]);
  const vertices = Array.from(geometry.getAttribute('position').array);
  const triangles = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: vertices.length / 3 }, (_, i) => i);
  if (triangles.length > 1_500_000)
    throw new Error('Yhdessä tuodussa osassa voi olla enintään 500 000 kolmiota.');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return bodySchema.parse({
    id: uid(),
    name: name.slice(0, 120),
    kind: 'cad',
    color: '#c3c7c6',
    origin,
    purpose: 'model',
    feature: {
      type: 'mesh',
      width: size[0],
      depth: size[1],
      height: size[2],
      vertices,
      triangles,
      normals: Array.from(geometry.getAttribute('normal').array),
      uv: geometry.getAttribute('uv') ? Array.from(geometry.getAttribute('uv').array) : undefined,
      solid: meshClosure(vertices, triangles).closed,
    },
  });
}
const fileStem = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, 100) || 'Tuotu malli';
function checkedProject(project: Project): Project {
  const parsed = projectSchema.parse(project);
  if (JSON.stringify(parsed).length > 64_000_000)
    throw new Error(
      'Tuotu malli ylittää Nivo-projektin tiedostokoon. Kevennä mallia ennen tuontia.',
    );
  return parsed;
}
export async function importMeshFiles(files: File[], options: ImportOptions): Promise<Project> {
  const file = files.find((f) => /\.(stl|glb|gltf)$/i.test(f.name));
  if (!file) throw new Error('Valitse STL-, GLB- tai glTF-tiedosto.');
  if (files.reduce((n, f) => n + f.size, 0) > 64 * 1024 * 1024)
    throw new Error('Tuonnin yhteiskoko voi olla enintään 64 MiB.');
  const project = { ...freshProject(), name: fileStem(file.name) };
  const matrix = new Matrix4().makeScale(
    importScale[options.unit],
    importScale[options.unit],
    importScale[options.unit],
  );
  if (options.up === 'y') matrix.multiply(new Matrix4().makeRotationX(Math.PI / 2));
  if (/\.stl$/i.test(file.name)) {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    try {
      geometry.applyMatrix4(matrix);
      project.bodies.push(bodyFromGeometry(geometry, project.name));
    } finally {
      geometry.dispose();
    }
    return checkedProject(project);
  }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const urls = new Map<string, string>();
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const basename = decodeURIComponent(url.split('/').at(-1) ?? '');
    const resource = files.find((f) => f.name === basename);
    if (!resource)
      throw new Error(
        `glTF:n liitetiedosto puuttuu: ${basename}. Valitse myös .bin- ja kuvatiedostot tai käytä GLB:tä.`,
      );
    if (!urls.has(resource.name)) urls.set(resource.name, URL.createObjectURL(resource));
    return urls.get(resource.name)!;
  });
  const assets: Record<string, TextureAsset> = {};
  const textures = new Map<Texture, Map<number, string>>();
  const textureAsset = (texture: Texture, name: string, channel = -1) => {
    const cached = textures.get(texture)?.get(channel);
    if (cached) return cached;
    const image = texture.image as { width: number; height: number };
    if (!image?.width || !image.height) throw new Error('Tekstuurin kuvaa ei voitu lukea.');
    const ratio = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext('2d')!;
    // Nivo uploads images with flipY=true; glTF textures use flipY=false.
    if (!texture.flipY) {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(texture.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if (channel >= 0) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = pixels.data[i + channel];
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    const id = uid();
    assets[id] = {
      name,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
    if (!textures.has(texture)) textures.set(texture, new Map());
    textures.get(texture)!.set(channel, id);
    return id;
  };
  try {
    const gltf = await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '');
    try {
      gltf.scene.updateMatrixWorld(true);
      const partGroups = new Map<Object3D, Map<number, Body[]>>();
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        if (
          object instanceof SkinnedMesh ||
          object.morphTargetInfluences?.some((v: number) => v !== 0)
        )
          throw new Error('Animoitu malli pitää viedä ensin staattisena GLB-mallina.');
        const source = object.geometry,
          materials = Array.isArray(object.material) ? object.material : [object.material];
        const groups = source.groups.length
          ? source.groups
          : [
              {
                start: 0,
                count: source.index?.count ?? source.getAttribute('position').count,
                materialIndex: 0,
              },
            ];
        // GLTFLoader represents a single glTF mesh with multiple materials as
        // a Group of primitives. Preserve that original part, but never merge
        // separate instances that happen to share the same mesh definition.
        const association = gltf.parser.associations.get(object);
        const parentAssociation = object.parent && gltf.parser.associations.get(object.parent);
        const owner =
          object.parent &&
          association?.meshes !== undefined &&
          parentAssociation?.meshes === association.meshes &&
          parentAssociation.primitives === undefined
            ? object.parent
            : object;
        if (!partGroups.has(owner)) partGroups.set(owner, new Map());
        const family = partGroups.get(owner)!;
        const count = object instanceof InstancedMesh ? object.count : 1;
        if (count > 10000)
          throw new Error('Yhdessä GLB-erässä voi olla enintään 10 000 instanssia.');
        for (let instance = 0; instance < count; instance++) {
          if (!family.has(instance)) family.set(instance, []);
          const parts = family.get(instance)!;
          for (const group of groups) {
            const geometry = new BufferGeometry();
            try {
              // Compact each material range, preserving its own UVs and vertex normals.
              for (const key of ['position', 'normal', 'uv']) {
                const attribute = source.getAttribute(key);
                if (!attribute) continue;
                const values: number[] = [];
                for (let i = group.start; i < group.start + group.count; i++) {
                  const index = source.index ? source.index.getX(i) : i;
                  for (let k = 0; k < attribute.itemSize; k++)
                    values.push(attribute.getComponent(index, k));
                }
                geometry.setAttribute(key, new Float32BufferAttribute(values, attribute.itemSize));
              }
              const transform = new Matrix4().multiplyMatrices(matrix, object.matrixWorld);
              if (object instanceof InstancedMesh) {
                const local = new Matrix4();
                object.getMatrixAt(instance, local);
                transform.multiply(local);
              }
              geometry.applyMatrix4(transform);
              if (transform.determinant() < 0) {
                const indices: number[] = [];
                for (let i = 0; i < geometry.getAttribute('position').count; i += 3)
                  indices.push(i, i + 2, i + 1);
                geometry.setIndex(indices);
              }
              // Positive glTF transforms remain editable material placements. The
              // legacy UV bake remains a fallback for reflected/out-of-range maps.
              const material = materials[group.materialIndex ?? 0] as MeshStandardMaterial;
              const uv = geometry.getAttribute('uv');
              const basePlacement = material.map && importedPlacement(material.map);
              if (uv && material.map && !basePlacement) {
                material.map.updateMatrix();
                const elements = material.map.matrix.elements;
                for (let i = 0; i < uv.count; i++) {
                  const u = uv.getX(i),
                    v = uv.getY(i);
                  uv.setXY(
                    i,
                    elements[0] * u + elements[3] * v + elements[6],
                    elements[1] * u + elements[4] * v + elements[7],
                  );
                }
              }
              const instanceName = owner.userData.nivoInstances?.[instance]?.name;
              const body = bodyFromGeometry(
                geometry,
                instanceName || owner.name || object.name || project.name,
              );
              const appearance = {
                ...defaultAppearance('matte'),
                preset: 'paint',
                roughness: material.roughness ?? 0.8,
                metalness: material.metalness ?? 0,
                texture: basePlacement || { ...textureDefaults, width: 1, height: 1 },
              };
              if (material.map)
                appearance.assetId = textureAsset(material.map, `${body.name} pinta`);
              if (material.normalMap)
                appearance.maps = {
                  normal: textureAsset(material.normalMap, `${body.name} normaali`),
                };
              if (material.roughnessMap)
                appearance.maps = {
                  ...appearance.maps,
                  roughness: textureAsset(material.roughnessMap, `${body.name} karheus`, 1),
                };
              if (material.metalnessMap)
                appearance.maps = {
                  ...appearance.maps,
                  metalness: textureAsset(material.metalnessMap, `${body.name} metallisuus`, 2),
                };
              if (material.aoMap)
                appearance.maps = {
                  ...appearance.maps,
                  ao: textureAsset(material.aoMap, `${body.name} AO`, 0),
                };
              // Keep independent PBR transforms. Baking the colour transform into
              // UVs used to silently enlarge fine normals to the albedo's scale.
              if (basePlacement || !material.map) {
                appearance.mapPlacements = {};
                for (const key of ['normal', 'roughness', 'metalness', 'ao'] as const) {
                  const map = material[`${key}Map`];
                  const placement = map && importedPlacement(map);
                  if (
                    placement &&
                    (!basePlacement || JSON.stringify(placement) !== JSON.stringify(basePlacement))
                  )
                    appearance.mapPlacements[key] = placement;
                }
              }
              if (material.roughnessMap) appearance.atlasMaps = true;
              if (material.normalMap) {
                appearance.normalStrength = Math.min(5, Math.abs(material.normalScale.x));
                if (material.normalScale.y < 0) appearance.normalFormat = 'directx';
              }
              body.color = `#${(material.color ?? new Color('#ffffff')).getHexString(SRGBColorSpace)}`;
              body.appearance = appearance;
              parts.push(body);
            } finally {
              geometry.dispose();
            }
          }
        }
      });
      project.bodies.push(
        ...Array.from(partGroups.values()).flatMap((family) =>
          Array.from(family.values(), combineParts),
        ),
      );
      if (!project.bodies.length) throw new Error('Tiedostossa ei ole kolmiopintoja.');
      return checkedProject({ ...project, assets });
    } finally {
      const textures = new Set<Texture>();
      gltf.scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            Object.values(material).forEach((v) => {
              if (v instanceof Texture) textures.add(v);
            });
            material.dispose();
          }
        }
      });
      textures.forEach((t) => {
        t.dispose();
        if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close();
      });
    }
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}

function importedPlacement(map: Texture): TexturePlacement | undefined {
  if (map.repeat.x <= 0 || map.repeat.y <= 0) return;
  map.updateMatrix();
  const width = 1 / map.repeat.x,
    height = 1 / map.repeat.y;
  const c = Math.cos(map.rotation),
    s = Math.sin(map.rotation);
  const [ox, oy] = [map.matrix.elements[6], map.matrix.elements[7]];
  const offsetX = -c * ox * width + s * oy * height;
  const offsetY = -s * ox * width - c * oy * height;
  if (
    width < 0.1 ||
    height < 0.1 ||
    width > 100000 ||
    height > 100000 ||
    Math.abs(offsetX) > 100000 ||
    Math.abs(offsetY) > 100000
  )
    return;
  return {
    width,
    height,
    offsetX,
    offsetY,
    rotation: (map.rotation * 180) / Math.PI,
    lockAspect: false,
  };
}

function combineParts(parts: Body[]): Body {
  if (parts.length === 1) return parts[0];
  if (!parts.length) throw new Error('Malliosan geometria puuttuu.');
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const b of parts)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.origin[i]);
      max[i] = Math.max(
        max[i],
        b.origin[i] + [b.feature.width, b.feature.depth, b.feature.height][i],
      );
    }
  const vertices: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    triangles: number[] = [],
    groups: { start: number; count: number }[] = [];
  const faceMaterials: NonNullable<Body['faceMaterials']> = {};
  parts.forEach((body, index) => {
    const f = body.feature;
    if (f.type !== 'mesh') return;
    const offset = vertices.length / 3;
    groups.push({ start: triangles.length, count: f.triangles.length });
    for (let i = 0; i < f.vertices.length; i++)
      vertices.push(f.vertices[i] + body.origin[i % 3] - min[i % 3]);
    for (const n of f.normals!) normals.push(n);
    for (const n of f.uv ?? new Array((f.vertices.length / 3) * 2).fill(0)) uv.push(n);
    for (const i of f.triangles) triangles.push(i + offset);
    faceMaterials[index] = { color: body.color, appearance: body.appearance! };
  });
  return bodySchema.parse({
    ...parts[0],
    origin: min,
    faceMaterials,
    feature: {
      type: 'mesh',
      width: max[0] - min[0],
      depth: max[1] - min[1],
      height: max[2] - min[2],
      vertices,
      normals,
      uv,
      triangles,
      groups,
      solid: meshClosure(vertices, triangles).closed,
    },
  });
}
