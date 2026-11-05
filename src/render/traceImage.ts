import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceLighting } from './traceLighting';
import type { DenoiseGuides } from './traceGuides';
import type { ImageLook } from './imageLook';
import { coarseImageWeight } from './traceRefinement';

/** Store only the complete beauty image, not a second full set of float32
 * accumulators. Denoise the live lobes synchronously at a sample boundary;
 * later display/tonemapping changes read the cached images, never a partial tile.
 * The raw cache stays float32; filtered display radiance is half-float as before. */
export function traceImage() {
  let raw: THREE.WebGLRenderTarget | undefined;
  let filtered: THREE.WebGLRenderTarget | undefined;
  let coarse: THREE.WebGLRenderTarget | undefined;
  let composite: THREE.WebGLRenderTarget | undefined;
  let source: THREE.WebGLRenderTarget | undefined;
  let filteredCurrent = false;
  let displayed: THREE.WebGLRenderTarget | undefined;
  let samples = 0;
  let albedoGuide: THREE.Texture | undefined;
  const copy = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const display = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { map: { value: null }, coarse: { value: null }, weight: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D map, coarse; uniform float weight;
      void main(){
        gl_FragColor=mix(texture2D(map,vUv),texture2D(coarse,vUv),weight);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new FullScreenQuad(copy);
  const denoise = traceLighting();
  const clear = () => {
    albedoGuide = undefined;
    source = undefined;
    denoise.clear();
    raw?.dispose();
    filtered?.dispose();
    coarse?.dispose();
    composite?.dispose();
    raw = filtered = coarse = composite = displayed = undefined;
    filteredCurrent = false;
    copy.map = null;
    display.uniforms.map.value = display.uniforms.coarse.value = null;
    samples = 0;
  };
  return {
    get size() {
      return raw ? ([raw.width, raw.height] as const) : undefined;
    },
    get ready() {
      return !!raw;
    },
    get historyWeight() {
      return coarse ? coarseImageWeight(samples) : 0;
    },
    /** Called before another tile writes to the accumulator. A filter toggle
     * may keep the raw cached frame until the next complete sample arrives. */
    invalidateSource() {
      source = undefined;
    },
    observe(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, count: number) {
      denoise.observe(renderer, target, count, albedoGuide);
    },
    capture(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, count: number) {
      if (raw && (raw.width !== target.width || raw.height !== target.height)) {
        coarse?.dispose();
        coarse = displayed ?? raw;
        if (raw !== coarse) raw.dispose();
        if (filtered !== coarse) filtered?.dispose();
        raw = filtered = displayed = undefined;
      }
      raw ??= new THREE.WebGLRenderTarget(target.width, target.height, {
        type: THREE.FloatType,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      const previous = renderer.getRenderTarget();
      copy.map = target.texture;
      quad.material = copy;
      try {
        renderer.setRenderTarget(raw);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(previous);
      }
      source = target;
      samples = count;
      filteredCurrent = false;
      if (coarse && coarseImageWeight(count) === 0) {
        coarse.dispose();
        coarse = undefined;
      }
    },
    draw(renderer: THREE.WebGLRenderer, smooth: boolean, look?: ImageLook, guides?: DenoiseGuides) {
      if (!raw) return;
      albedoGuide = guides?.albedo;
      if (smooth && !filteredCurrent && source) {
        filtered ??= new THREE.WebGLRenderTarget(raw.width, raw.height, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        });
        denoise.draw(renderer, source, samples, guides, filtered);
        filteredCurrent = true;
      }
      displayed = smooth && filteredCurrent ? filtered! : raw;
      const weight = coarse ? coarseImageWeight(samples) : 0;
      display.uniforms.map.value = displayed.texture;
      display.uniforms.coarse.value = coarse?.texture ?? displayed.texture;
      display.uniforms.weight.value = weight;
      quad.material = display;
      const previous = renderer.getRenderTarget();
      try {
        if (look?.active) {
          if (weight) {
            composite ??= new THREE.WebGLRenderTarget(raw.width, raw.height, {
              type: THREE.HalfFloatType,
              depthBuffer: false,
            });
            composite.setSize(raw.width, raw.height);
            renderer.setRenderTarget(composite);
            quad.render(renderer);
            look.draw(renderer, composite.texture);
          } else {
            composite?.dispose();
            composite = undefined;
            look.draw(renderer, displayed.texture);
          }
        } else {
          composite?.dispose();
          composite = undefined;
          renderer.setRenderTarget(null);
          quad.render(renderer);
        }
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    clear,
    dispose() {
      clear();
      quad.dispose();
      copy.dispose();
      display.dispose();
      denoise.dispose();
    },
  };
}
