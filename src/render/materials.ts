import * as THREE from 'three';
import {
  findPreset,
  defaultAppearance,
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
  texture.matrixAutoUpdate = false;
  texture.matrix.set(
    c / placement.width,
    s / placement.width,
    (-c * placement.offsetX - s * placement.offsetY) / placement.width,
    -s / placement.height,
    c / placement.height,
    (s * placement.offsetX - c * placement.offsetY) / placement.height,
    0,
    0,
    1,
  );
}
export function createMaterialLibrary(draw: () => void) {
  const patterns = new Map<string, HTMLCanvasElement>();
  const images = new Map<string, HTMLImageElement>();
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const configure = (texture: THREE.Texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  };
  return {
    create(body: Body, assets: Record<string, TextureAsset> = {}) {
      const appearance = body.appearance ?? defaultAppearance(body.material),
        preset = findPreset(appearance.preset);
      let map: THREE.Texture | null = null;
      const asset = appearance.assetId ? assets[appearance.assetId] : undefined;
      if (asset) {
        let image = images.get(appearance.assetId!);
        if (!image) {
          image = new Image();
          images.set(appearance.assetId!, image);
          image.src = asset.dataUrl;
        }
        map = new THREE.Texture(image);
        const texture = map;
        if (image.complete) texture.needsUpdate = true;
        else {
          const promise = image.decode().then(() => {
            if (!disposed) {
              texture.needsUpdate = true;
              draw();
            }
          });
          pending.add(promise);
          void promise.catch(() => {}).finally(() => pending.delete(promise));
        }
      } else if (preset.pattern) {
        let canvas = patterns.get(preset.id);
        if (!canvas) {
          canvas = patternCanvas(preset);
          patterns.set(preset.id, canvas);
        }
        map = new THREE.CanvasTexture(canvas);
      }
      if (map) {
        configure(map);
        texturePlacement(map, appearance.texture);
      }
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
      });
      const frame = textureFrameMatrix(body).invert();
      material.onBeforeCompile = (shader) => {
        shader.uniforms.nivoTextureFrame = { value: frame };
        shader.vertexShader =
          'uniform mat4 nivoTextureFrame; varying vec3 nivoP; varying vec3 nivoN;\n' +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n nivoP=(nivoTextureFrame*vec4(position,1.0)).xyz; nivoN=mat3(nivoTextureFrame)*normal;',
        );
        shader.fragmentShader =
          'varying vec3 nivoP; varying vec3 nivoN; uniform mat3 mapTransform;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
          vec3 weights=pow(abs(normalize(nivoN)),vec3(6.0));weights/=max(dot(weights,vec3(1.0)),0.00001);
          vec4 cx=texture2D(map,(mapTransform*vec3(nivoP.yz,1.0)).xy);
          vec4 cy=texture2D(map,(mapTransform*vec3(nivoP.xz,1.0)).xy);
          vec4 cz=texture2D(map,(mapTransform*vec3(nivoP.xy,1.0)).xy);
          diffuseColor *= cx*weights.x+cy*weights.y+cz*weights.z;
        #endif`,
        );
      };
      material.customProgramCacheKey = () => 'nivo-triplanar-v1';
      return material;
    },
    async ready() {
      await Promise.all([...pending]);
    },
    dispose() {
      disposed = true;
      patterns.clear();
      images.clear();
    },
  };
}
