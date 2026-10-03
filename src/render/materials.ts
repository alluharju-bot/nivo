import * as THREE from 'three';
import {
  findPreset,
  defaultAppearance,
  emissionSettings,
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

/** Height -> tangent-space normal. Data stays linear; no color-space conversion. */
export function heightNormal(source: CanvasImageSource, width = 512, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height),
    out = ctx.createImageData(width, height);
  const value = (x: number, y: number) => {
    const i = (((y + height) % height) * width + ((x + width) % width)) * 4;
    return (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / (3 * 255);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const n = new THREE.Vector3(
        (value(x - 1, y) - value(x + 1, y)) * 2,
        (value(x, y + 1) - value(x, y - 1)) * 2,
        1,
      ).normalize();
      const i = (y * width + x) * 4;
      out.data[i] = (n.x * 0.5 + 0.5) * 255;
      out.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      out.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return canvas;
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
  const pending = new Set<Promise<void>>();
  const failed = new Set<HTMLImageElement>();
  const activeImages = new Map<THREE.Texture, HTMLImageElement>();
  let disposed = false;
  const texture = (source: CanvasImageSource, color: boolean, placement: TexturePlacement) => {
    const map =
      source instanceof HTMLCanvasElement
        ? new THREE.CanvasTexture(source)
        : new THREE.Texture(source);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.anisotropy = 8;
    texturePlacement(map, placement);
    return map;
  };
  const load = (id: string, asset: TextureAsset) => {
    let image = images.get(id);
    if (!image || image.src !== asset.dataUrl) {
      normals.delete(`asset:${id}`);
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
    create(body: Body, assets: Record<string, TextureAsset> = {}) {
      const appearance = body.appearance ?? defaultAppearance(body.material),
        preset = findPreset(appearance.preset);
      const placement = appearance.texture;
      let map: THREE.Texture | null = null,
        pattern: HTMLCanvasElement | undefined;
      const imageMap = (id: string | undefined, color = false, bump = false) => {
        if (!id || !assets[id]) return null;
        const image = load(id, assets[id]);
        const result = texture(image, color, placement);
        activeImages.set(result, image);
        result.addEventListener('dispose', () => activeImages.delete(result));
        wait(image, () => {
          if (bump) {
            let converted = normals.get(`asset:${id}`);
            if (!converted) {
              converted = heightNormal(image);
              normals.set(`asset:${id}`, converted);
            }
            result.image = converted;
          }
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
          : imageMap(appearance.maps?.bump, false, true);
        roughnessMap = imageMap(appearance.maps?.roughness);
        if (pattern) {
          if (!normals.has(`preset:${preset.id}`))
            normals.set(`preset:${preset.id}`, heightNormal(pattern));
          if (!roughness.has(preset.id)) {
            const c = document.createElement('canvas');
            c.width = c.height = 512;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(pattern, 0, 0);
            const pixels = ctx.getImageData(0, 0, 512, 512);
            for (let i = 0; i < pixels.data.length; i += 4) {
              const value = 190 + (255 - pixels.data[i]) * 0.25;
              pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
            }
            ctx.putImageData(pixels, 0, 0);
            roughness.set(preset.id, c);
          }
          normalMap ??= texture(normals.get(`preset:${preset.id}`)!, false, placement);
          roughnessMap ??= texture(roughness.get(preset.id)!, false, placement);
        }
      }
      const strength = appearance.normalStrength ?? (preset.pattern === 'micro' ? 0.2 : 0.6);
      const material = new THREE.MeshPhysicalMaterial({
        color: body.color,
        side: THREE.DoubleSide,
        roughness: appearance.roughness ?? preset.roughness,
        metalness: appearance.metalness ?? preset.metalness,
        transmission: appearance.transmission ?? preset.transmission ?? 0,
        clearcoat: appearance.clearcoat ?? preset.clearcoat ?? 0,
        thickness: Math.max(
          1,
          Math.min(body.feature.width, body.feature.depth, body.feature.height) * 0.1,
        ),
        ior: 1.5,
        map,
        normalMap,
        roughnessMap,
        normalScale: new THREE.Vector2(strength, strength),
        metalnessMap: imageMap(appearance.maps?.metalness),
      });
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
