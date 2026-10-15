import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { screenVertex } from './traceDenoise';

/** Welford variance of the mean, reconstructed from consecutive radiance means.
 * One representative pixel per 2×2 block; two RG32F targets cost 4 bytes per
 * full-resolution pixel (12 MB at the preview limit). No CPU readback and no
 * filtered/coarse colors in the estimator. Camera/size changes discard history. */
export function traceVariance() {
  let previous: THREE.WebGLRenderTarget | undefined;
  let next: THREE.WebGLRenderTarget | undefined;
  let samples = 0;
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      map: { value: null },
      subtractMap: { value: null },
      subtract: { value: false },
      guide: { value: null },
      useGuide: { value: false },
      history: { value: null },
      count: { value: 1 },
      continuing: { value: false },
    },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D map, history;
      uniform sampler2D subtractMap;
      uniform bool subtract;
      uniform sampler2D guide;
      uniform bool useGuide;
      uniform float count;
      uniform bool continuing;
      void main() {
        ivec2 p = ivec2(vUv * vec2(textureSize(map, 0)));
        vec3 c = texelFetch(map, p, 0).rgb;
        if (subtract) c = max(vec3(0.0), c - texelFetch(subtractMap, p, 0).rgb);
        float mean = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec2 old = texture2D(history, vUv).rg;
        float delta = mean - abs(old.r);
        float variance = continuing ? max(0.0, (count - 2.0) / count * old.g + delta * delta) : 0.0;
        float roughness = useGuide ? texture2D(guide,vUv).a : 1.0;
        float signedMean = subtract && (roughness < 0.14 || roughness >= 0.4) ? -max(mean,1e-10) : mean;
        gl_FragColor = vec4(signedMean, variance, 0.0, 1.0);
      }`,
  });
  const quad = new FullScreenQuad(material);
  const clear = () => {
    previous?.dispose();
    next?.dispose();
    previous = next = undefined;
    samples = 0;
    material.uniforms.map.value = material.uniforms.history.value = null;
  };
  return {
    get texture() {
      return samples >= 4 ? previous?.texture : undefined;
    },
    update(
      renderer: THREE.WebGLRenderer,
      source: THREE.WebGLRenderTarget,
      count: number,
      channel = 0,
      subtract = false,
      guide?: THREE.Texture,
    ) {
      const w = Math.ceil(source.width / 2),
        h = Math.ceil(source.height / 2);
      if (previous && (previous.width !== w || previous.height !== h || count <= samples)) clear();
      const options = {
        type: THREE.FloatType,
        format: THREE.RGFormat,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      };
      previous ??= new THREE.WebGLRenderTarget(w, h, options);
      next ??= new THREE.WebGLRenderTarget(w, h, options);
      material.uniforms.map.value = source.textures[channel];
      material.uniforms.subtractMap.value = source.textures[1] ?? source.texture;
      material.uniforms.subtract.value = subtract;
      material.uniforms.guide.value = guide ?? null;
      material.uniforms.useGuide.value = !!guide;
      material.uniforms.history.value = samples ? previous.texture : source.texture;
      material.uniforms.count.value = count;
      material.uniforms.continuing.value = count === samples + 1 && samples > 0;
      const target = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(next);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(target);
      }
      [previous, next] = [next, previous];
      samples = count;
    },
    clear,
    dispose() {
      clear();
      material.dispose();
      quad.dispose();
    },
  };
}
