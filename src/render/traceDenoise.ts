import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { DenoiseGuides } from './traceGuides';

export const screenVertex =
  'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Relative HDR distances treat the same percentage of noise equally in a lit
 * and unlit surface. Independent raster guides protect real albedo, normal-map
 * relief and depth discontinuities. Never filter the accumulated radiance. */
export function traceDenoise() {
  let intermediate: THREE.WebGLRenderTarget | undefined;
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      map: { value: null },
      albedoMap: { value: null },
      normalMap: { value: null },
      useGuides: { value: false },
      varianceMap: { value: null },
      useVariance: { value: false },
      stepSize: { value: 1 },
    },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D map, albedoMap, normalMap, varianceMap;
      uniform bool useVariance;
      uniform float stepSize;
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
        // The measured temporal variance is independent of grain and seams.
        // Use neighboring estimates too: a single quiet pixel must not reject
        // all its noisy neighbors. Reflective surfaces keep a narrow footprint.
        float v0 = useVariance ? texture2D(varianceMap, vUv).g : 0.0;
        // A rare bright event may land between the half-resolution temporal
        // representatives. Estimate its local variance too, only on matching
        // material/normal/depth. Never interpret grain or a silhouette as noise.
        if (useVariance && useGuides && confidence >= 0.4 && stepSize == 1.0) {
          float sumY = 0.0, sumY2 = 0.0, sumW = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 uv = clamp(vUv + vec2(float(i), float(j)) * pixel, pixel * 0.5, vec2(1.0) - pixel * 0.5);
            vec4 a = texture2D(albedoMap, uv), n = texture2D(normalMap, uv);
            vec3 da = a.rgb - albedo.rgb, dn = n.rgb - normal.rgb;
            float w = exp(-dot(da, da) / 0.0018 - dot(dn, dn) / 0.008 - abs(n.a - normal.a) * 120.0);
            float value = max(nivoLuminance(texture2D(map, uv).rgb), 0.0);
            sumY += w * value; sumY2 += w * value * value; sumW += w;
          }
          v0 = max(v0, max(0.0, sumY2 / sumW - pow(sumY / sumW, 2.0)));
        }
        vec4 sum = vec4(0.0); float total = 0.0;
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
          float radius = float(x*x+y*y); if (radius > 5.0) continue;
          if (stepSize > 1.0 && (abs(x) > 1 || abs(y) > 1)) continue;
          vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
          vec4 sampleColor = texture2D(map, uv);
          float y1 = max(nivoLuminance(sampleColor.rgb), 0.0);
          float scale = max(max(y0, y1), 0.002);
          vec3 delta = (sampleColor.rgb - center.rgb) / scale;
          float v1 = useVariance ? texture2D(varianceMap, uv).g : 0.0;
          float sigma2 = useVariance
            ? clamp(3.0 * (v0 + v1) / (scale * scale), 0.0001, 0.5)
            : threshold * threshold;
          // First-surface guides cannot describe a mirror's reflected details.
          sigma2 *= mix(0.12, 1.0, confidence);
          float weight = exp(-radius / 3.0 - dot(delta, delta) / (6.0 * sigma2));
          if (stepSize > 1.0 && confidence < 0.4 && radius > 0.0) weight = 0.0;
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
      variance?: THREE.Texture,
    ) {
      material.uniforms.map.value = map;
      material.uniforms.varianceMap.value = variance ?? map;
      material.uniforms.useVariance.value = !!variance;
      material.uniforms.stepSize.value = 1;
      material.uniforms.useGuides.value = !!guides;
      material.uniforms.albedoMap.value = guides?.albedo ?? map;
      material.uniforms.normalMap.value = guides?.normal ?? map;
      const target = renderer.getRenderTarget();
      try {
        if (variance && guides) {
          const image = map.image as { width: number; height: number };
          intermediate ??= new THREE.WebGLRenderTarget(image.width, image.height, {
            type: THREE.HalfFloatType,
            depthBuffer: false,
          });
          intermediate.setSize(image.width, image.height);
          renderer.setRenderTarget(intermediate);
          quad.render(renderer);
          material.uniforms.map.value = intermediate.texture;
          material.uniforms.stepSize.value = 2;
        } else {
          intermediate?.dispose();
          intermediate = undefined;
        }
        renderer.setRenderTarget(output);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(target);
      }
    },
    clear() {
      intermediate?.dispose();
      intermediate = undefined;
    },
    dispose() {
      intermediate?.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}
