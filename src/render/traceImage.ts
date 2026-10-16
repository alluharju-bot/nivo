import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceLighting } from './traceLighting';
import type { DenoiseGuides } from './traceGuides';
import type { ImageLook } from './imageLook';
import { coarseImageWeight } from './traceRefinement';

/** Keep the last complete sample visible while the next one is computed in
 * small invisible batches, including across resolution increases. */
export function traceImage() {
  let target: THREE.WebGLRenderTarget | undefined;
  let coarse: THREE.WebGLRenderTarget | undefined;
  let samples = 0;
  let filtered: THREE.WebGLRenderTarget | undefined;
  let albedoGuide: THREE.Texture | undefined;
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      map: { value: null as THREE.Texture | null },
      coarse: { value: null as THREE.Texture | null },
      coarseWeight: { value: 0 },
      diffuse: { value: null },
      coarseDiffuse: { value: null },
      coverage: { value: null },
    },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D coarse;
      uniform float coarseWeight;
      varying vec2 vUv;
      uniform sampler2D diffuse, coarseDiffuse;
      uniform sampler2D coverage;
      layout(location = 1) out vec4 diffuseOutput;
      layout(location = 2) out vec4 coverageOutput;
      void main() {
        gl_FragColor = mix(texture2D(map, vUv), texture2D(coarse, vUv), coarseWeight);
        diffuseOutput = mix(texture2D(diffuse, vUv), texture2D(coarseDiffuse, vUv), coarseWeight);
        // Geometry coverage belongs to the current pixel footprint. Coarse
        // radiance is only a transient display estimate, never guide history.
        coverageOutput = texture2D(coverage, vUv);
      }`,
  });
  const display = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(copy);
  const denoise = traceLighting();
  return {
    get noise() {
      return denoise.noise;
    },
    get size() {
      return target ? ([target.width, target.height] as const) : undefined;
    },
    get ready() {
      return !!target;
    },
    get historyWeight() {
      return coarse ? coarseImageWeight(samples) : 0;
    },
    observe(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, count: number) {
      denoise.observe(renderer, source, count, albedoGuide);
    },
    capture(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, count: number) {
      if (target && (target.width !== source.width || target.height !== source.height)) {
        coarse?.dispose();
        coarse = target;
        target = undefined;
      }
      target ??= new THREE.WebGLRenderTarget(source.width, source.height, {
        count: source.textures.length,
        type: THREE.FloatType,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      target.setSize(source.width, source.height);
      const previous = renderer.getRenderTarget();
      copy.uniforms.map.value = source.texture;
      copy.uniforms.coarse.value = coarse?.texture ?? source.texture;
      copy.uniforms.coarseWeight.value = coarse ? coarseImageWeight(count) : 0;
      copy.uniforms.diffuse.value = source.textures[1] ?? source.texture;
      copy.uniforms.coarseDiffuse.value =
        coarse?.textures[1] ?? source.textures[1] ?? source.texture;
      copy.uniforms.coverage.value = source.textures[2] ?? source.texture;
      quad.material = copy;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
      samples = count;
      if (coarse && coarseImageWeight(count) === 0) {
        coarse.dispose();
        coarse = undefined;
        copy.uniforms.coarse.value = null;
      }
    },
    draw(renderer: THREE.WebGLRenderer, smooth: boolean, look?: ImageLook, guides?: DenoiseGuides) {
      if (!target) return;
      albedoGuide = guides?.albedo;
      if (look?.active) {
        if (smooth) {
          filtered ??= new THREE.WebGLRenderTarget(target.width, target.height, {
            type: THREE.HalfFloatType,
            depthBuffer: false,
          });
          filtered.setSize(target.width, target.height);
          denoise.draw(renderer, target, samples, guides, filtered);
          look.draw(renderer, filtered.texture);
        } else {
          filtered?.dispose();
          filtered = undefined;
          look.draw(renderer, target.texture);
        }
      } else {
        filtered?.dispose();
        filtered = undefined;
        if (smooth) denoise.draw(renderer, target, samples, guides);
        else {
          display.map = target.texture;
          quad.material = display;
          const previous = renderer.getRenderTarget();
          renderer.setRenderTarget(null);
          quad.render(renderer);
          renderer.setRenderTarget(previous);
        }
      }
    },
    clear() {
      albedoGuide = undefined;
      denoise.clear();
      target?.dispose();
      coarse?.dispose();
      filtered?.dispose();
      filtered = undefined;
      target = undefined;
      coarse = undefined;
      copy.uniforms.map.value = copy.uniforms.coarse.value = null;
      display.map = null;
      samples = 0;
    },
    dispose() {
      target?.dispose();
      coarse?.dispose();
      filtered?.dispose();
      filtered = undefined;
      target = undefined;
      coarse = undefined;
      quad.dispose();
      copy.dispose();
      display.dispose();
      denoise.dispose();
    },
  };
}
