import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceDenoise } from './traceDenoise';

/** Keep the last complete sample visible while the next one is computed in
 * small invisible batches, including across resolution increases. */
export function traceImage() {
  let target: THREE.WebGLRenderTarget | undefined;
  let samples = 0;
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { map: { value: null as THREE.Texture | null } },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader:
      'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
  });
  const display = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(copy);
  const denoise = traceDenoise();
  return {
    get ready() {
      return !!target;
    },
    capture(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, count: number) {
      target ??= new THREE.WebGLRenderTarget(source.width, source.height, {
        type: THREE.FloatType,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      target.setSize(source.width, source.height);
      const previous = renderer.getRenderTarget();
      copy.uniforms.map.value = source.texture;
      quad.material = copy;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
      samples = count;
    },
    draw(renderer: THREE.WebGLRenderer, smooth: boolean) {
      if (!target) return;
      if (smooth && samples >= 8) denoise.draw(renderer, target.texture, samples);
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
      target = undefined;
      samples = 0;
    },
    dispose() {
      target?.dispose();
      target = undefined;
      quad.dispose();
      copy.dispose();
      display.dispose();
      denoise.dispose();
    },
  };
}
