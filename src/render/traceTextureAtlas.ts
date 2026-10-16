import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';

const budget = 128 * 1024 * 1024;
export const textureSlots = 256;
type Tile = { x: number; y: number; size: number; layer: number };
type SourceSize = number | { size: number; priority: number };

/** Power-of-two square tiles pack exactly into quadrants, with no padding.
 * Small maps no longer force every wood/normal map down to the same resolution.
 * Linear half floats preserve dark sRGB grain as well as subtle normal vectors. */
export function packedTexturePlan(
  dimensions: SourceSize[],
  layerLimit: number,
  textureLimit = 2048,
) {
  if (layerLimit < 1 || textureLimit < 1)
    throw new Error(
      'Näytönohjain ei tue tarkentuvan kuvan materiaalikuvia. Nopea esikatselu säilyy käytettävissä.',
    );
  if (dimensions.length > textureSlots)
    throw new Error(
      `Mallissa on ${dimensions.length} eri materiaalikuvaa. Tarkentuvan kuvan raja on ${textureSlots} kuvaa. Nopea esikatselu säilyy käytettävissä.`,
    );
  const maximum = Math.max(1, 2 ** Math.floor(Math.log2(Math.min(2048, textureLimit))));
  const sizes = dimensions.map((s) =>
    Math.min(maximum, 2 ** Math.ceil(Math.log2(Math.max(1, typeof s === 'number' ? s : s.size)))),
  );
  const priorities = dimensions.map((s) => (typeof s === 'number' ? 1 : s.priority));
  for (;;) {
    const side = Math.max(1, ...sizes);
    const layers = Math.min(layerLimit, Math.max(1, Math.floor(budget / (side * side * 8))));
    const free: Tile[] = [],
      tiles: Tile[] = [];
    let depth = 0;
    let fits = true;
    for (const index of sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b)) {
      const size = sizes[index];
      free.sort((a, b) => a.size - b.size || a.layer - b.layer || a.y - b.y || a.x - b.x);
      let slot = free.findIndex((t) => t.size >= size);
      if (slot < 0) {
        if (depth >= layers) {
          fits = false;
          break;
        }
        free.push({ x: 0, y: 0, size: side, layer: depth++ });
        slot = free.length - 1;
      }
      const tile = free.splice(slot, 1)[0];
      while (tile.size > size) {
        tile.size /= 2;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [1, 1],
        ])
          free.push({
            x: tile.x + dx * tile.size,
            y: tile.y + dy * tile.size,
            size: tile.size,
            layer: tile.layer,
          });
      }
      tiles[index] = tile;
    }
    if (fits)
      return {
        count: dimensions.length,
        size: side,
        layers: Math.max(1, depth),
        bytes: side * side * Math.max(1, depth) * 8,
        tiles,
      };
    // Reduce only the largest source(s) needed to fit the fixed memory budget.
    // Never grow a small image just because another material has a large map.
    let reduce = -1,
      score = 0;
    sizes.forEach((size, i) => {
      const candidate = size / Math.sqrt(Math.max(1, priorities[i]));
      if (size > 1 && candidate >= score) {
        reduce = i;
        score = candidate;
      }
    });
    if (reduce < 0) throw new Error('Materiaalikuvat eivät mahdu näytönohjaimen muistiin.');
    sizes[reduce] /= 2;
  }
}

export const textureDimension = (texture: THREE.Texture) => {
  const image = texture.image as
    { naturalWidth?: number; width?: number; naturalHeight?: number; height?: number } | undefined;
  return Math.max(
    image?.naturalWidth ?? image?.width ?? 1,
    image?.naturalHeight ?? image?.height ?? 1,
  );
};
export const textureSpec = (texture: THREE.Texture) => ({
  size: textureDimension(texture),
  priority: texture.colorSpace === THREE.SRGBColorSpace ? 4 : 1,
});

export const packedTextureSampler = /* glsl */ `
  uniform vec4 nivoTextureLayout[NIVO_TEXTURE_SLOTS];
  vec4 nivoTexture(sampler2DArray atlas, vec3 uv) {
    vec4 tile = nivoTextureLayout[int(uv.z)];
    vec2 p = fract(uv.xy) * tile.z - 0.5;
    vec2 base = floor(p), f = fract(p);
    vec2 side = vec2(textureSize(atlas, 0).xy);
    // Hardware filtering for the interior; explicit repeat at tile boundaries
    // prevents a neighboring material from bleeding into a seam. No extra sampler.
    if (all(greaterThanEqual(base, vec2(0.0))) && all(lessThan(base + 1.0, vec2(tile.z))))
      return texture(atlas, vec3((tile.xy + p + 0.5) / side, tile.w));
    ivec2 a = ivec2(tile.xy + mod(base, tile.z));
    ivec2 b = ivec2(tile.xy + mod(base + 1.0, tile.z));
    int layer = int(tile.w);
    return mix(mix(texelFetch(atlas, ivec3(a,layer),0), texelFetch(atlas, ivec3(b.x,a.y,layer),0), f.x),
      mix(texelFetch(atlas, ivec3(a.x,b.y,layer),0), texelFetch(atlas, ivec3(b,layer),0), f.x), f.y);
  }
`;

/** Pinned tracer adapter: retain its texture indices, transform table and one
 * texture unit, replacing only the upload/storage and sampling of those images. */
export function prepareTextureAtlas(tracer: WebGLPathTracer) {
  const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
    ._pathTracer.material;
  const marker = 'uniform sampler2DArray textures;';
  if (
    material.fragmentShader.split(marker).length !== 2 ||
    (material.fragmentShader.match(/texture2D\( textures,/g)?.length ?? 0) !== 20
  )
    throw new Error('Renderöinnin materiaalikuvien versio ei vastaa sovellusta.');
  const old = material.uniforms.textures.value as THREE.Texture;
  const target = new THREE.WebGLArrayRenderTarget(1, 1, 1);
  target.depthBuffer = false;
  Object.assign(target.texture, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  target.texture.renderTarget = target;
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { map: { value: null as THREE.Texture | null } },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }',
    fragmentShader:
      'varying vec2 vUv; uniform sampler2D map; void main() { gl_FragColor = texture2D(map,vUv); }',
  });
  const quad = new FullScreenQuad(copy);
  // The shared resource owner releases both the array target and its copy material.
  Object.assign(target, { fsQuad: quad });
  const layout = Array.from({ length: textureSlots }, () => new THREE.Vector4(0, 0, 1, 0));
  material.uniforms.nivoTextureLayout = { value: layout };
  material.defines.NIVO_TEXTURE_SLOTS = 1;
  material.userData.textureSampler = packedTextureSampler;
  material.fragmentShader = material.fragmentShader
    .replace(marker, `${marker}\n${packedTextureSampler}`)
    .replaceAll('texture2D( textures,', 'nivoTexture( textures,');
  material.uniforms.textures.value = target.texture;
  old.dispose();
  let hashes: string[] = [],
    lastPlan = '';
  Object.assign(target.texture, {
    setTextures(renderer: THREE.WebGLRenderer, textures: THREE.Texture[]) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (textures.length + 96 > gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))
        throw new Error(
          'Mallin materiaalikuvat ylittävät tämän näytönohjaimen tarkentuvan kuvan rajan. Nopea esikatselu säilyy käytettävissä.',
        );
      const slots = Math.max(1, textures.length);
      if (material.defines.NIVO_TEXTURE_SLOTS !== slots) {
        material.defines.NIVO_TEXTURE_SLOTS = slots;
        // First preparation compiles once in configureEmitterSampling, after
        // all scene-dependent defines are known. Later palette changes must
        // rebuild the array's uniform declaration before the next sample.
        if (material.uniforms.nivoBackgroundColor) material.needsUpdate = true;
      }
      const plan = packedTexturePlan(
        textures.map(textureSpec),
        gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
        renderer.capabilities.maxTextureSize,
      );
      const key = JSON.stringify(plan);
      if (key !== lastPlan) {
        target.setSize(plan.size, plan.size, plan.layers);
        hashes = [];
        lastPlan = key;
      }
      const previous = renderer.getRenderTarget(),
        face = renderer.getActiveCubeFace(),
        mip = renderer.getActiveMipmapLevel();
      const autoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        textures.forEach((texture, i) => {
          const tile = plan.tiles[i];
          layout[i].set(tile.x, tile.y, tile.size, tile.layer);
          const hash = `${texture.source.uuid}:${texture.version}:${texture.source.version}:${texture.colorSpace}`;
          if (hashes[i] === hash) return;
          // Raw map UVs: the tracer's material table applies placement once.
          copy.uniforms.map.value = texture;
          target.viewport.set(tile.x, tile.y, tile.size, tile.size);
          renderer.setRenderTarget(target, tile.layer);
          quad.render(renderer);
          hashes[i] = hash;
        });
      } finally {
        copy.uniforms.map.value = null;
        target.viewport.set(0, 0, plan.size, plan.size);
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(previous, face, mip);
      }
      renderer.domElement.dataset.traceTextureSize = String(plan.size);
      renderer.domElement.dataset.traceTextureLayers = String(plan.count);
      renderer.domElement.dataset.traceTexturePages = String(plan.layers);
      renderer.domElement.dataset.traceTextureBytes = String(plan.bytes);
      renderer.domElement.dataset.traceTextureMinSize = String(
        Math.min(plan.size, ...plan.tiles.map((t) => t.size)),
      );
    },
  });
}
