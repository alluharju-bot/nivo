import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceDenoise } from './traceDenoise';
import { coarseImageWeight } from './traceRefinement';

/** Keep the last complete sample visible while the next one is computed in
 * small invisible batches, including across resolution increases. */
export function traceImage() {
  let target: THREE.WebGLRenderTarget | undefined;
  let coarse: THREE.WebGLRenderTarget | undefined;
  let samples = 0;
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      map: { value: null as THREE.Texture | null },
      coarse: { value: null as THREE.Texture | null },
      coarseWeight: { value: 0 },
    },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D coarse;
      uniform float coarseWeight;
      varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(map, vUv), texture2D(coarse, vUv), coarseWeight);
      }`,
  });
  const display = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(copy);
  const denoise = traceDenoise();
  return {
    get ready() {
      return !!target;
    },
    get historyWeight() {
      return coarse ? coarseImageWeight(samples) : 0;
    },
    capture(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, count: number) {
      if (target && (target.width !== source.width || target.height !== source.height)) {
        coarse?.dispose();
        coarse = target;
        target = undefined;
      }
      target ??= new THREE.WebGLRenderTarget(source.width, source.height, {
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
    draw(renderer: THREE.WebGLRenderer, smooth: boolean) {
      if (!target) return;
      // Keep filtering consistent across resolution changes; toggling it at
      // eight samples caused a second visible jump after every upgrade.
      if (smooth) denoise.draw(renderer, target.texture, samples);
      else {
        display.map = target.texture;
        quad.material = display;
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(null);
        quad.render(renderer);
        renderer.setRenderTarget(previous);
      }
    },
    clear() {
      target?.dispose();
      coarse?.dispose();
      target = undefined;
      coarse = undefined;
      copy.uniforms.map.value = copy.uniforms.coarse.value = null;
      display.map = null;
      samples = 0;
    },
    dispose() {
      target?.dispose();
      coarse?.dispose();
      target = undefined;
      coarse = undefined;
      quad.dispose();
      copy.dispose();
      display.dispose();
      denoise.dispose();
    },
  };
}
