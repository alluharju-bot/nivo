import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { screenVertex, traceDenoise } from './traceDenoise';
import { traceVariance } from './traceVariance';
import type { DenoiseGuides } from './traceGuides';

/** Filter independent lighting components without feeding filtered colors back
 * into path accumulation. Share the a-trous scratch buffers between lobes. */
export function traceLighting() {
  const filter = traceDenoise();
  const variance = [traceVariance(), traceVariance(), traceVariance()];
  let filtered: THREE.WebGLRenderTarget[] | undefined;
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { diffuse: { value: null }, specular: { value: null } },
    vertexShader: screenVertex,
    fragmentShader: `varying vec2 vUv; uniform sampler2D diffuse, specular;
      void main() {
        vec4 a = texture2D(diffuse,vUv), b = texture2D(specular,vUv);
        gl_FragColor = vec4(a.rgb + b.rgb, a.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new FullScreenQuad(material);
  const clear = () => {
    filter.clear();
    variance.forEach((v) => v.clear());
    filtered?.forEach((t) => t.dispose());
    filtered = undefined;
    material.uniforms.diffuse.value = material.uniforms.specular.value = null;
  };
  return {
    get noise() {
      return variance[2].texture;
    },
    observe(
      renderer: THREE.WebGLRenderer,
      source: THREE.WebGLRenderTarget,
      count: number,
      guide?: THREE.Texture,
    ) {
      if (source.textures.length > 1) {
        variance[1].update(renderer, source, count, 1);
        variance[2].update(renderer, source, count, 0, true, guide);
      } else variance[0].update(renderer, source, count);
    },
    draw(
      renderer: THREE.WebGLRenderer,
      source: THREE.WebGLRenderTarget,
      samples: number,
      guides?: DenoiseGuides,
      output: THREE.WebGLRenderTarget | null = null,
    ) {
      if (source.textures.length < 2) {
        filter.draw(renderer, source.texture, samples, guides, output, variance[0].texture);
        return;
      }
      filtered ??= [0, 1].map(
        () =>
          new THREE.WebGLRenderTarget(source.width, source.height, {
            type: THREE.HalfFloatType,
            depthBuffer: false,
          }),
      );
      filtered.forEach((t) => t.setSize(source.width, source.height));
      filter.draw(
        renderer,
        source.textures[1],
        samples,
        guides,
        filtered[0],
        variance[1].texture,
        1,
      );
      filter.draw(
        renderer,
        source.texture,
        samples,
        guides,
        filtered[1],
        variance[2].texture,
        2,
        source.textures[1],
      );
      material.uniforms.diffuse.value = filtered[0].texture;
      material.uniforms.specular.value = filtered[1].texture;
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(output);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    clear,
    dispose() {
      clear();
      filter.dispose();
      variance.forEach((v) => v.dispose());
      material.dispose();
      quad.dispose();
    },
  };
}
