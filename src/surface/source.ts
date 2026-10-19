import { materialFaceRanges } from '../render/layerUV';
import { layerDomain } from '../render/layers';
import { Float32BufferAttribute, SRGBColorSpace, type Texture } from 'three';
import type { Body, Project } from '../model/project';
import { faceMaterialBody } from '../model/faceMaterials';
import { createMaterialLibrary, materialUV, disposeMaterial } from '../render/materials';
import { geometryOf, type SurfaceMesh } from './mesh';
import type { BakeSource, SampleTexture } from './bake';

function textureSnapshot(texture: Texture | null): SampleTexture | undefined {
  if (!texture) return;
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  const ratio = Math.min(1, 1024 / Math.max(image.width, image.height)),
    width = Math.max(1, Math.round(image.width * ratio)),
    height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  texture.updateMatrix();
  return {
    width,
    height,
    pixels: ctx.getImageData(0, 0, width, height).data,
    matrix: texture.matrix.toArray(),
    flipY: texture.flipY,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    srgb: texture.colorSpace === SRGBColorSpace,
  };
}
export async function bakeSource(
  body: Body,
  mesh: SurfaceMesh,
  assets: Project['assets'],
): Promise<BakeSource> {
  const library = createMaterialLibrary(() => {});
  const g = geometryOf(mesh);
  g.translate(...body.origin);
  if (mesh.uv) g.setAttribute('uv', new Float32BufferAttribute(mesh.uv, 2));
  else
    materialUV(
      g,
      body.feature.type === 'mesh'
        ? { ...body, feature: { ...body.feature, uv: undefined } }
        : body,
      materialFaceRanges(mesh.faces),
    );
  const materials = new Map(
    [...new Set(mesh.faces)].map((face) => [
      face,
      library.create(faceMaterialBody(body, face), assets, layerDomain(g)),
    ]),
  );
  try {
    await library.ready();
    return {
      mesh: {
        ...mesh,
        positions: Array.from(g.getAttribute('position').array).map(
          (n, i) => n - body.origin[i % 3],
        ),
        normals: Array.from(g.getAttribute('normal').array),
        indices: Array.from(g.index!.array),
        uv: Array.from(g.getAttribute('uv').array),
      },
      materials: Object.fromEntries(
        [...materials].map(([face, m]) => [
          face,
          {
            color: m.color.toArray(),
            roughness: m.roughness,
            metalness: m.metalness,
            normalScale: m.normalScale.toArray(),
            map: textureSnapshot(m.map),
            normalMap: textureSnapshot(m.normalMap),
            roughnessMap: textureSnapshot(m.roughnessMap),
            metalnessMap: textureSnapshot(m.metalnessMap),
          },
        ]),
      ),
    };
  } finally {
    g.dispose();
    materials.forEach(disposeMaterial);
    library.dispose();
  }
}
