import { EquirectangularReflectionMapping, type Texture } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const isTraceEnvironment = (texture: Texture | null): texture is Texture =>
  texture?.mapping === EquirectangularReflectionMapping;

/** Shared physical light source for raster reflections and path-traced lighting. */
export async function loadStudioEnvironment() {
  const texture = await new HDRLoader().loadAsync(
    `${import.meta.env.BASE_URL}materials/studio_small_09/environment.hdr`,
  );
  texture.mapping = EquirectangularReflectionMapping;
  texture.name = 'Poly Haven · Studio Small 09 · CC0';
  return texture;
}
