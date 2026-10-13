import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { DenoiseGuides } from './traceGuides';

export const screenVertex =
  'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Relative HDR distances treat the same percentage of noise equally in a lit
 * and unlit surface. Independent raster guides protect real albedo, normal-map
 * relief and depth discontinuities. Never filter the accumulated radiance. */
export function traceDenoise() {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      map: { value: null },
      albedoMap: { value: null },
      normalMap: { value: null },
      useGuides: { value: false },
    },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D map, albedoMap, normalMap;
      uniform bool useGuides;
      float nivoLuminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        vec4 center = texture2D(map, vUv);
        vec4 albedo = useGuides ? texture2D(albedoMap, vUv) : vec4(0.0);
        vec4 normal = useGuides ? texture2D(normalMap, vUv) : vec4(0.0);
        vec2 pixel = 1.0 / vec2(textureSize(map, 0));
        float y0 = max(nivoLuminance(center.rgb), 0.0);
        float confidence = useGuides ? albedo.a : 0.0;
        // Keep a small, constant display footprint at high sample counts.
        // Noise disappearing naturally stops changing the image; a sample count
        // alone must never turn smoothing off while bright surfaces are noisy.
        float threshold = mix(0.065, 0.22, confidence);
        vec4 sum = vec4(0.0); float total = 0.0;
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
          float radius = float(x*x+y*y); if (radius > 5.0) continue;
          vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel, pixel * 0.5, vec2(1.0) - pixel * 0.5);
          vec4 sampleColor = texture2D(map, uv);
          float y1 = max(nivoLuminance(sampleColor.rgb), 0.0);
          float scale = max(max(y0, y1), 0.002);
          vec3 delta = (sampleColor.rgb - center.rgb) / scale;
          float weight = exp(-radius / 3.0 - dot(delta, delta) / (6.0 * threshold * threshold));
          weight *= exp(-abs(sampleColor.a - center.a) * 64.0);
          if (useGuides) {
            vec4 a = texture2D(albedoMap, uv), n = texture2D(normalMap, uv);
            vec3 da = a.rgb - albedo.rgb;
            // Tight texture/color guide: retain one-pixel wood grain and grout.
            weight *= exp(-dot(da, da) / 0.0018 - abs(a.a - albedo.a) * 24.0);
            weight *= exp(-dot(n.rgb - normal.rgb, n.rgb - normal.rgb) / 0.008);
            weight *= exp(-abs(n.a - normal.a) * 120.0);
          }
          sum += sampleColor * weight; total += weight;
        }
        gl_FragColor = sum / max(total, 1e-8);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const quad = new FullScreenQuad(material);
  return {
    draw(
      renderer: THREE.WebGLRenderer,
      map: THREE.Texture,
      _samples: number,
      guides?: DenoiseGuides,
      output: THREE.WebGLRenderTarget | null = null,
    ) {
      material.uniforms.map.value = map;
      material.uniforms.useGuides.value = !!guides;
      material.uniforms.albedoMap.value = guides?.albedo ?? map;
      material.uniforms.normalMap.value = guides?.normal ?? map;
      const target = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(output);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(target);
      }
    },
    dispose() {
      quad.dispose();
      material.dispose();
    },
  };
}
