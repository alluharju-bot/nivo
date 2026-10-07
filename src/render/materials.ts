import * as THREE from 'three';
import { derivedCanvas } from './surfaceMaps';
import {
  findPreset,
  defaultAppearance,
  emissionSettings,
  surfaceDepth,
  surfaceStrength,
  type MaterialPreset,
  type TexturePlacement,
  type TextureAsset,
} from '../model/materials';
import type { Body } from '../model/project';

/** Deterministic, offline patterns; the species have different grain and pore structure. */
export function patternCanvas(preset: MaterialPreset) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!,
    image = ctx.createImageData(512, 512),
    seed = preset.seed ?? 1;
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 73.1) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
      THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
      v,
    );
  };
  const valueAt = (x: number, y: number) => {
    const n = noise(x / 38, y / 38),
      fine = hash(x, y);
    let value = 240;
    const warp = x + 18 * Math.sin(y / 170 + seed) + 28 * (noise(x / 100, y / 240) - 0.5);
    switch (preset.pattern) {
      case 'plaster':
        value = 244 + 8 * noise(x / 3, y / 3) - 9 * noise(x / 95, y / 95) - fine * 3;
        break;
      case 'concrete': {
        const pores = noise(x / 2.7, y / 2.7);
        value = 217 + 24 * noise(x / 90, y / 90) - 12 * n - fine * 5;
        if (preset.id === 'concrete-raw') value -= Math.max(0, pores - 0.7) * 220;
        else value += 7 * noise(x / 160, y / 24);
        break;
      }
      case 'limestone':
        value = 228 + 18 * n - 14 * noise(x / 5, y / 3) - (fine > 0.985 ? 35 : 0);
        break;
      case 'sandstone':
        value = 215 + 20 * noise(x / 150, y / 12) + fine * 24 - 12 * n;
        break;
      case 'terrazzo': {
        const cellX = Math.floor(x / 16),
          cellY = Math.floor(y / 16);
        const dx = x / 16 - cellX - 0.5,
          dy = y / 16 - cellY - 0.5;
        const chip = Math.abs(dx) + Math.abs(dy * 1.3) < 0.22 + hash(cellX, cellY) * 0.24;
        value = chip ? 130 + hash(cellX + 8, cellY + 7) * 120 : 242 - fine * 4;
        break;
      }
      case 'tile': {
        // A repeat is one tile including its joint; real-world joint width stays 2 mm.
        const px = ((x % 512) + 512) % 512,
          py = ((y % 512) + 512) % 512;
        const edge = Math.min(
          (Math.min(px, 512 - px) * (preset.size?.[0] ?? 300)) / 512,
          (Math.min(py, 512 - py) * (preset.size?.[1] ?? 600)) / 512,
        );
        const grout = 155 + fine * 15;
        const face = preset.id === 'tile-terracotta' ? 228 + n * 20 - fine * 9 : 253 - n * 3;
        value = THREE.MathUtils.lerp(grout, face, THREE.MathUtils.smoothstep(edge, 0.7, 1.7));
        break;
      }
      case 'micro':
        value = 248 + fine * 7;
        break;
      case 'fiber':
        value = 205 + 40 * noise(x / 3, y / 7) + 10 * fine;
        break;
      case 'oak':
        value =
          235 -
          42 * Math.pow(Math.abs(Math.sin(warp / 12)), 8) -
          28 * Math.pow(noise(x / 3, y / 100), 5) -
          fine * 8;
        break;
      case 'walnut':
        value =
          220 -
          70 * Math.pow(Math.abs(Math.sin(warp / 24 + noise(x / 80, y / 200) * 2)), 5) +
          fine * 8;
        break;
      case 'birch':
        value =
          240 - 22 * Math.pow(Math.sin(warp / 32), 2) - 18 * noise(x / 40, y / 210) - fine * 4;
        break;
      case 'pine': {
        const knot = Math.hypot((x - 210) / 1.8, (y - 290) / 3);
        value =
          242 -
          65 * Math.pow(Math.abs(Math.sin(warp / 19 + Math.exp(-knot / 55) * 12)), 12) -
          fine * 5;
        break;
      }
      case 'brushed':
        value = 224 + 25 * noise(x * 2, y / 200) - fine * 7;
        break;
      case 'granite':
        value = 150 + 100 * noise(x / 2, y / 2) + (fine > 0.92 ? 35 : 0);
        break;
      case 'marble':
        value = 250 - 100 * Math.exp(-Math.abs(Math.sin((x + y * 0.6) / 62 + n * 4)) * 14) - n * 8;
        break;
      case 'slate':
        value = 185 + 45 * noise(x / 160, y / 5) + 20 * n;
        break;
      case 'travertine':
        value = 225 - 30 * noise(x / 80, y / 10) - (noise(x / 3, y / 2) > 0.75 ? 65 : 0);
        break;
    }
    return value;
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const tx = x / 512,
        ty = y / 512,
        u = tx * tx * (3 - 2 * tx),
        v = ty * ty * (3 - 2 * ty);
      const value = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(valueAt(x, y), valueAt(x - 512, y), u),
        THREE.MathUtils.lerp(valueAt(x, y - 512), valueAt(x - 512, y - 512), u),
        v,
      );
      const i = (y * 512 + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
export function textureFrameMatrix(body: Body) {
  const origin = new THREE.Vector3(...body.origin).add(
    new THREE.Vector3(...(body.textureFrame?.offset ?? [0, 0, 0])),
  );
  return new THREE.Matrix4().compose(
    origin,
    new THREE.Quaternion(...(body.textureFrame?.rotation ?? [0, 0, 0, 1])).normalize(),
    new THREE.Vector3(1, 1, 1),
  );
}
export function texturePlacement(texture: THREE.Texture, placement: TexturePlacement) {
  const a = (placement.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  // The tracer rebuilds texture matrices from these fields when uploading its atlas.
  // Keep the transform reconstructible instead of storing it only in matrix.elements.
  texture.matrixAutoUpdate = true;
  texture.center.set(0, 0);
  texture.repeat.set(1 / placement.width, 1 / placement.height);
  texture.rotation = a;
  texture.offset.set(
    (-c * placement.offsetX - s * placement.offsetY) / placement.width,
    (s * placement.offsetX - c * placement.offsetY) / placement.height,
  );
  texture.updateMatrix();
}
/** Shared local millimetre UVs: every PBR channel and both renderers use the same frame. */
export function materialUV(geometry: THREE.BufferGeometry, body: Body) {
  const positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal');
  const inverse = textureFrameMatrix(body).invert(),
    uv: number[] = [];
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(inverse);
    normal.fromBufferAttribute(normals, i).transformDirection(inverse);
    const values = normal.toArray().map(Math.abs),
      axis = values.indexOf(Math.max(...values));
    uv.push(point.getComponent(axis === 0 ? 1 : 0), point.getComponent(axis === 2 ? 1 : 2));
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

export function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}
export function createMaterialLibrary(draw: () => void) {
  const patterns = new Map<string, HTMLCanvasElement>(),
    images = new Map<string, HTMLImageElement>();
  const normals = new Map<string, HTMLCanvasElement>(),
    roughness = new Map<string, HTMLCanvasElement>();
  const sources = new WeakMap<object, THREE.Source<CanvasImageSource>>();
  const activeDerived = new Set<string>();
  const sourceFor = (image: CanvasImageSource) => {
    let source = sources.get(image);
    if (!source) {
      source = new THREE.Source(image);
      sources.set(image, source);
    }
    return source;
  };
  const pending = new Set<Promise<void>>();
  const failed = new Set<HTMLImageElement>();
  const activeImages = new Map<THREE.Texture, HTMLImageElement>();
  let disposed = false;
  const texture = (source: CanvasImageSource, color: boolean, placement: TexturePlacement) => {
    const map: THREE.Texture<CanvasImageSource> =
      source instanceof HTMLCanvasElement
        ? new THREE.CanvasTexture(source)
        : new THREE.Texture(source);
    map.source = sourceFor(source);
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.anisotropy = 8;
    texturePlacement(map, placement);
    return map;
  };
  const load = (id: string, asset: TextureAsset) => {
    let image = images.get(id);
    if (!image || image.src !== asset.dataUrl) {
      image = new Image();
      images.set(id, image);
      image.src = asset.dataUrl;
    }
    return image;
  };
  const wait = (image: HTMLImageElement, update: () => void) => {
    if (image.complete && image.naturalWidth) {
      update();
      return;
    }
    const promise = image
      .decode()
      .then(() => {
        if (!disposed) {
          failed.delete(image);
          update();
          draw();
        }
      })
      .catch(() => {
        failed.add(image);
      });
    pending.add(promise);
    void promise.finally(() => pending.delete(promise)).catch(() => {});
  };
  return {
    beginFrame() {
      activeDerived.clear();
    },
    endFrame() {
      for (const cache of [normals, roughness])
        for (const key of cache.keys()) if (!activeDerived.has(key)) cache.delete(key);
    },
    create(body: Body, assets: Record<string, TextureAsset> = {}) {
      const appearance = body.appearance ?? defaultAppearance(body.material),
        preset = findPreset(appearance.preset);
      const placement = appearance.texture;
      const physical = {
        width: placement.width,
        height: placement.height,
        depth: appearance.bumpDepth ?? surfaceDepth(preset),
      };
      const cached = (
        key: string,
        source: CanvasImageSource,
        kind: 'normal' | 'roughness',
        legacy = false,
      ) => {
        const cache = kind === 'normal' ? normals : roughness;
        const cacheKey = `${key}:${kind}:${kind === 'normal' ? JSON.stringify(legacy ? null : physical) : ''}`;
        activeDerived.add(cacheKey);
        let result = cache.get(cacheKey);
        if (!result) {
          result = derivedCanvas(source, kind, legacy ? undefined : physical);
          cache.set(cacheKey, result);
        }
        return result;
      };
      let map: THREE.Texture | null = null,
        pattern: HTMLCanvasElement | undefined;
      const imageMap = (
        id: string | undefined,
        color = false,
        derived?: 'normal' | 'roughness',
        legacy = false,
      ) => {
        if (!id || !assets[id]) return null;
        const image = load(id, assets[id]);
        const result = texture(image, color, placement);
        activeImages.set(result, image);
        result.addEventListener('dispose', () => activeImages.delete(result));
        wait(image, () => {
          if (derived)
            result.source = sourceFor(
              cached(`asset:${id}:${sourceFor(image).uuid}`, image, derived, legacy),
            );
          result.needsUpdate = true;
        });
        return result;
      };
      if (appearance.assetId) map = imageMap(appearance.assetId, true);
      else if (preset.pattern) {
        pattern = patterns.get(preset.id);
        if (!pattern) {
          pattern = patternCanvas(preset);
          patterns.set(preset.id, pattern);
        }
        map = texture(pattern, true, placement);
      }
      let normalMap: THREE.Texture | null = null,
        roughnessMap: THREE.Texture | null = null;
      if (appearance.surfaceDetail !== false) {
        normalMap = appearance.maps?.normal
          ? imageMap(appearance.maps.normal)
          : imageMap(appearance.maps?.bump, false, 'normal', appearance.bumpDepth === undefined);
        roughnessMap = imageMap(appearance.maps?.roughness);
        if (appearance.generatedSurface && appearance.assetId) {
          normalMap ??= imageMap(appearance.assetId, false, 'normal');
          roughnessMap ??= imageMap(appearance.assetId, false, 'roughness');
        }
        if (pattern) {
          normalMap ??= texture(cached(`preset:${preset.id}`, pattern, 'normal'), false, placement);
          roughnessMap ??= texture(
            cached(`preset:${preset.id}`, pattern, 'roughness'),
            false,
            placement,
          );
        }
      }
      const strength = surfaceStrength(appearance);
      // An explicit finish overrides the roughness texture. Multiplying a matte
      // finish by a dark map silently reintroduced gloss. Keep color and relief.
      if (appearance.roughness !== undefined && roughnessMap) {
        roughnessMap.dispose();
        roughnessMap = null;
      }
      const finishRoughness = appearance.roughness ?? preset.roughness;
      const material = new THREE.MeshPhysicalMaterial({
        color: body.color,
        side: THREE.DoubleSide,
        roughness: finishRoughness,
        metalness: appearance.metalness ?? preset.metalness,
        transmission: appearance.transmission ?? preset.transmission ?? 0,
        clearcoat: finishRoughness === 1 ? 0 : (appearance.clearcoat ?? preset.clearcoat ?? 0),
        clearcoatRoughness: finishRoughness,
        thickness: Math.max(
          1,
          Math.min(body.feature.width, body.feature.depth, body.feature.height) * 0.1,
        ),
        ior: 1.5,
        map,
        normalMap,
        roughnessMap,
        normalScale: new THREE.Vector2(
          strength,
          appearance.maps?.normal && appearance.normalFormat === 'directx' ? -strength : strength,
        ),
        metalnessMap: imageMap(appearance.maps?.metalness),
      });
      if (
        !appearance.maps?.normal &&
        (appearance.maps?.bump
          ? appearance.bumpDepth !== undefined
          : !!pattern || (appearance.generatedSurface && appearance.assetId))
      )
        material.userData.physicalSurface = {
          width: placement.width,
          height: placement.height,
          strength,
        };
      const emission = emissionSettings(appearance, body.color);
      material.emissive.set(emission.color);
      material.emissiveIntensity = emission.enabled ? emission.intensity : 0;
      return material;
    },
    async ready() {
      await Promise.all([...pending]);
      if ([...activeImages.values()].some((image) => failed.has(image)))
        throw new Error('Materiaalin kuvaa ei voitu lukea. Tuo kyseinen kuva uudelleen.');
    },
    dispose() {
      disposed = true;
      patterns.clear();
      images.clear();
      normals.clear();
      roughness.clear();
      activeImages.clear();
      failed.clear();
    },
  };
}

/** Keep physical relief constant while the texture is scaled interactively, without regenerating images per frame. */
export function updateMaterialPlacement(
  material: THREE.MeshPhysicalMaterial,
  placement: TexturePlacement,
) {
  for (const value of Object.values(material))
    if (value instanceof THREE.Texture) texturePlacement(value, placement);
  const physical = material.userData.physicalSurface;
  if (physical)
    material.normalScale.set(
      (physical.strength * physical.width) / placement.width,
      (physical.strength * physical.height) / placement.height,
    );
}
