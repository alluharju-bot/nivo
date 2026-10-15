import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { DenoiseGuides } from './traceGuides';

export const screenVertex =
  'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Relative HDR distances treat the same percentage of noise equally in a lit
 * and unlit surface. Independent raster guides protect real albedo, normal-map
 * relief and depth discontinuities. Never filter the accumulated radiance. */
export function traceDenoise() {
  const steps = [1, 2, 4, 8, 16];
  let intermediate: THREE.WebGLRenderTarget[] | undefined;
  const clear = () => {
    intermediate?.forEach((t) => t.dispose());
    intermediate = undefined;
  };
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      map: { value: null },
      originalMap: { value: null },
      finalPass: { value: false },
      albedoMap: { value: null },
      normalMap: { value: null },
      useGuides: { value: false },
      varianceMap: { value: null },
      useVariance: { value: false },
      stepSize: { value: 1 },
      projectionInverse: { value: new THREE.Matrix4() },
    },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D map, albedoMap, normalMap, varianceMap, originalMap;
      uniform bool finalPass;
      uniform bool useVariance;
      uniform float stepSize;
      uniform bool useGuides;
      uniform mat4 projectionInverse;
      vec3 viewPosition(vec2 uv, float depth) {
        vec2 xy = uv * 2.0 - 1.0;
        vec4 a = projectionInverse * vec4(xy, -1.0, 1.0);
        vec4 b = projectionInverse * vec4(xy, 0.0, 1.0);
        vec3 nearPoint = a.xyz / a.w * 0.001;
        vec3 ray = b.xyz / b.w * 0.001 - nearPoint;
        return nearPoint + ray * ((-depth - nearPoint.z) / ray.z);
      }
      float surfaceWeight(vec2 uv, float depth, float centerDepth, vec3 position, vec3 planeNormal) {
        if (depth <= 0.0 || centerDepth <= 0.0) return depth == centerDepth ? 1.0 : 0.0;
        vec3 offset = viewPosition(uv, depth) - position;
        // Reject a different surface, not the depth slope of this surface.
        // Geometric derivatives deliberately exclude the material's bump map.
        float tolerance = max(centerDepth * 0.000002, length(offset) * 0.02);
        float distance = abs(dot(offset, planeNormal)) / max(tolerance, 1e-8);
        return exp(-distance * distance);
      }
      float nivoLuminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        vec4 center = texture2D(map, vUv);
        vec4 albedo = useGuides ? texture2D(albedoMap, vUv) : vec4(0.0);
        vec4 normal = useGuides ? texture2D(normalMap, vUv) : vec4(0.0);
        vec3 position = viewPosition(vUv, normal.a);
        vec3 geometricNormal = cross(dFdx(position), dFdy(position));
        geometricNormal /= max(length(geometricNormal), 1e-20);
        vec2 pixel = 1.0 / vec2(textureSize(map, 0));
        float y0 = max(nivoLuminance(center.rgb), 0.0);
        float confidence = useGuides ? albedo.a : 0.0;
        // Measured uncertainty, not sample count, controls edge stopping. A
        // quiet surface retains lighting detail while sparse bright noise needs
        // more than a compact blur that merely turns points into blotches.
        float threshold = mix(0.065, 0.22, confidence);
        // The measured temporal variance is independent of grain and seams.
        // Use neighboring estimates too: a single quiet pixel must not reject
        // all its noisy neighbors. Reflective surfaces keep a narrow footprint.
        float v0 = useVariance ? (stepSize > 1.0 ? center.a : texture2D(varianceMap, vUv).g) : 0.0;
        // A rare bright event may land between the half-resolution temporal
        // representatives. Estimate its local variance too, only on matching
        // material/normal/depth on the first scale. Subsequent scales carry the
        // reduced variance in alpha instead of reusing the raw noisy estimate.
        // This prevents an early bright neighborhood being frozen as a blob.
        if (useVariance && useGuides && confidence >= 0.4 && stepSize == 1.0) {
          float sumY = 0.0, sumY2 = 0.0, sumW = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 uv = clamp(vUv + vec2(float(i), float(j)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
            vec4 a = texture2D(albedoMap, uv), n = texture2D(normalMap, uv);
            vec3 da = a.rgb - albedo.rgb, dn = n.rgb - normal.rgb;
            float w = exp(-dot(da, da) / 0.0018 - dot(dn, dn) / 0.008);
            w *= surfaceWeight(uv, n.a, normal.a, position, geometricNormal);
            float value = max(nivoLuminance(texture2D(map, uv).rgb), 0.0);
            sumY += w * value; sumY2 += w * value * value; sumW += w;
          }
          v0 = max(v0, max(0.0, sumY2 / sumW - pow(sumY / sumW, 2.0)));
        }
        vec4 sum = vec4(0.0); float total = 0.0, varianceSum = 0.0;
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
          float radius = float(x*x+y*y); if (radius > 5.0) continue;
          if (stepSize > 1.0 && (abs(x) > 1 || abs(y) > 1)) continue;
          vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
          vec4 sampleColor = texture2D(map, uv);
          float y1 = max(nivoLuminance(sampleColor.rgb), 0.0);
          float scale = max(max(y0, y1), 0.002);
          vec3 delta = (sampleColor.rgb - center.rgb) / scale;
          float v1 = useVariance ? (stepSize > 1.0 ? sampleColor.a : texture2D(varianceMap, uv).g) : 0.0;
          float varianceScale = confidence >= 0.4 ? 8.0 : 3.0;
          float varianceLimit = confidence >= 0.4 ? 1.5 : 0.5;
          float sigma2 = useVariance
            ? clamp(varianceScale * (v0 + v1) / (scale * scale), 0.0001, varianceLimit)
            : threshold * threshold;
          // First-surface guides cannot describe a mirror's reflected details.
          sigma2 *= mix(0.12, 1.0, confidence);
          float weight = exp(-radius / 3.0 - dot(delta, delta) / (6.0 * sigma2));
          if (stepSize > 1.0 && confidence < 0.4 && radius > 0.0) weight = 0.0;
          if (stepSize == 1.0) weight *= exp(-abs(sampleColor.a - center.a) * 64.0);
          if (useGuides) {
            vec4 a = texture2D(albedoMap, uv), n = texture2D(normalMap, uv);
            vec3 da = a.rgb - albedo.rgb;
            // Tight texture/color guide: retain one-pixel wood grain and grout.
            weight *= exp(-dot(da, da) / 0.0018 - abs(a.a - albedo.a) * 24.0);
            weight *= exp(-dot(n.rgb - normal.rgb, n.rgb - normal.rgb) / 0.008);
            weight *= surfaceWeight(uv, n.a, normal.a, position, geometricNormal);
          }
          sum += sampleColor * weight; total += weight; varianceSum += weight * weight * max(v0, v1);
        }
        gl_FragColor = sum / max(total, 1e-8);
        gl_FragColor.a = finalPass ? texture2D(originalMap, vUv).a : min(65504.0, varianceSum / max(total*total, 1e-8));
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
      material.uniforms.map.value = material.uniforms.originalMap.value = map;
      material.uniforms.finalPass.value = false;
      material.uniforms.varianceMap.value = variance ?? map;
      material.uniforms.useVariance.value = !!variance;
      material.uniforms.stepSize.value = 1;
      material.uniforms.useGuides.value = !!guides;
      material.uniforms.albedoMap.value = guides?.albedo ?? map;
      material.uniforms.normalMap.value = guides?.normal ?? map;
      if (guides) material.uniforms.projectionInverse.value.copy(guides.projectionInverse);
      const target = renderer.getRenderTarget();
      try {
        if (variance && guides) {
          const image = map.image as { width: number; height: number };
          // Five à-trous scales reuse two buffers. Carry uncertainty along with
          // radiance so later passes retain genuine light/shadow boundaries.
          // Mirrors and glass use only the conservative first scale.
          intermediate ??= [0, 1].map(
            () =>
              new THREE.WebGLRenderTarget(image.width, image.height, {
                type: THREE.HalfFloatType,
                depthBuffer: false,
              }),
          );
          for (let i = 0; i < steps.length - 1; i++) {
            const stage = intermediate[i % 2];
            stage.setSize(image.width, image.height);
            material.uniforms.stepSize.value = steps[i];
            renderer.setRenderTarget(stage);
            quad.render(renderer);
            material.uniforms.map.value = stage.texture;
          }
          material.uniforms.stepSize.value = steps[steps.length - 1];
        } else {
          clear();
        }
        material.uniforms.finalPass.value = true;
        renderer.setRenderTarget(output);
        quad.render(renderer);
      } finally {
        renderer.setRenderTarget(target);
      }
    },
    clear,
    dispose() {
      clear();
      quad.dispose();
      material.dispose();
    },
  };
}
