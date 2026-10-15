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
      vec3 reflectance(vec2 uv) {
        if (!useGuides) return vec3(1.0);
        vec4 a = texture2D(albedoMap, uv);
        // Filter illumination, then restore the unfiltered surface texture.
        // The floor keeps dark paint/specular energy from amplifying noise.
        return a.a >= 0.4 ? max(a.rgb, vec3(0.04)) : vec3(1.0);
      }
      vec4 colorAt(vec2 uv) {
        vec4 c = texture2D(map, uv);
        if (stepSize == 1.0) c.rgb /= reflectance(uv);
        return c;
      }
      float varianceAt(vec2 uv, vec4 c) {
        if (!useVariance) return 0.0;
        if (stepSize > 1.0) return c.a;
        // Convert radiance variance to the demodulated illumination domain.
        float factor = nivoLuminance(reflectance(uv));
        return texture2D(varianceMap, uv).g / (factor * factor);
      }
      void main() {
        vec4 center = colorAt(vUv);
        vec4 albedo = useGuides ? texture2D(albedoMap, vUv) : vec4(0.0);
        vec4 normal = useGuides ? texture2D(normalMap, vUv) : vec4(0.0);
        vec3 position = viewPosition(vUv, normal.a);
        vec2 pixel = 1.0 / vec2(textureSize(map, 0));
        // Derivatives across an object boundary describe a fictitious sloping
        // plane between foreground and background. Choose the continuous side
        // in each direction before testing surface membership.
        vec2 leftUv = clamp(vUv - vec2(pixel.x, 0.0), pixel * 0.5, 1.0 - pixel * 0.5);
        vec2 rightUv = clamp(vUv + vec2(pixel.x, 0.0), pixel * 0.5, 1.0 - pixel * 0.5);
        vec2 downUv = clamp(vUv - vec2(0.0, pixel.y), pixel * 0.5, 1.0 - pixel * 0.5);
        vec2 upUv = clamp(vUv + vec2(0.0, pixel.y), pixel * 0.5, 1.0 - pixel * 0.5);
        float dl = texture2D(normalMap, leftUv).a, dr = texture2D(normalMap, rightUv).a;
        float dd = texture2D(normalMap, downUv).a, du = texture2D(normalMap, upUv).a;
        bool rightSide = leftUv.x > vUv.x - pixel.x * 0.25 ||
          (rightUv.x > vUv.x + pixel.x * 0.25 && abs(dr - normal.a) < abs(dl - normal.a));
        bool upSide = downUv.y > vUv.y - pixel.y * 0.25 ||
          (upUv.y > vUv.y + pixel.y * 0.25 && abs(du - normal.a) < abs(dd - normal.a));
        vec3 dx = rightSide
          ? viewPosition(rightUv, dr) - position : position - viewPosition(leftUv, dl);
        vec3 dy = upSide
          ? viewPosition(upUv, du) - position : position - viewPosition(downUv, dd);
        vec3 geometricNormal = cross(dx, dy);
        geometricNormal /= max(length(geometricNormal), 1e-20);
        // A silhouette pixel contains fractional coverage of several surfaces,
        // while raster guides describe only its center. Filtering it as though
        // it belonged wholly to one surface destroys AA and crawls along edges.
        // Preserve the accumulated coverage, flag it through the filter pyramid,
        // and exclude it from later interior filtering (negative variance).
        bool coverage = stepSize > 1.0 && center.a < 0.0;
        if (useGuides && stepSize == 1.0) {
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 uv = clamp(vUv + vec2(float(i), float(j)) * pixel, pixel * 0.5, vec2(1.0) - pixel * 0.5);
            float depth = texture2D(normalMap, uv).a;
            if (surfaceWeight(uv, depth, normal.a, position, geometricNormal) < 0.05) coverage = true;
          }
        }
        if (coverage) {
          gl_FragColor = vec4(center.rgb, finalPass ? texture2D(originalMap, vUv).a : -1.0);
          if (finalPass) gl_FragColor.rgb *= reflectance(vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        float y0 = max(nivoLuminance(center.rgb), 0.0);
        float confidence = useGuides ? albedo.a : 0.0;
        // Measured uncertainty, not sample count, controls edge stopping. A
        // quiet surface retains lighting detail while sparse bright noise needs
        // more than a compact blur that merely turns points into blotches.
        float threshold = mix(0.065, 0.22, confidence);
        // The measured temporal variance is independent of grain and seams.
        // Use neighboring estimates too: a single quiet pixel must not reject
        // all its noisy neighbors. Reflective surfaces keep a narrow footprint.
        float v0 = varianceAt(vUv, center);
        // A rare bright event may land between the half-resolution temporal
        // representatives. Estimate its local variance too, only on matching
        // material/normal/depth on the first scale. Subsequent scales carry the
        // reduced variance in alpha instead of reusing the raw noisy estimate.
        // This prevents an early bright neighborhood being frozen as a blob.
        if (useVariance && useGuides && confidence >= 0.4 && stepSize == 1.0) {
          float sumY = 0.0, sumY2 = 0.0, sumW = 0.0, sumVariance = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 uv = clamp(vUv + vec2(float(i), float(j)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
            vec4 a = texture2D(albedoMap, uv), n = texture2D(normalMap, uv);
            vec3 da = a.rgb - albedo.rgb, dn = n.rgb - normal.rgb;
            float w = exp(-dot(da, da) / 0.0018 - dot(dn, dn) / 0.008);
            w *= surfaceWeight(uv, n.a, normal.a, position, geometricNormal);
            vec4 c = colorAt(uv);
            float value = max(nivoLuminance(c.rgb), 0.0);
            sumY += w * value; sumY2 += w * value * value; sumW += w;
            sumVariance += w * varianceAt(uv, c);
          }
          // Spatial contrast alone is not noise: a converged shadow or bump
          // must not keep re-inflating variance forever. Neighboring temporal
          // evidence bounds the spatial fallback for rare unsampled spikes.
          float spatial = max(0.0, sumY2 / sumW - pow(sumY / sumW, 2.0));
          float meanY = sumY / sumW;
          bool sparseOutlier = spatial > max(meanY * meanY * 0.05, 1e-8);
          v0 = max(v0, sparseOutlier ? spatial : min(spatial, 4.0 * sumVariance / sumW));
        }
        vec4 sum = vec4(0.0); float total = 0.0, varianceSum = 0.0;
        for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
          float radius = float(x*x+y*y); if (radius > 5.0) continue;
          if (stepSize > 1.0 && (abs(x) > 1 || abs(y) > 1)) continue;
          vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
          vec4 sampleColor = colorAt(uv);
          float y1 = max(nivoLuminance(sampleColor.rgb), 0.0);
          float scale = max(max(y0, y1), 0.002);
          vec3 delta = (sampleColor.rgb - center.rgb) / scale;
          float v1 = varianceAt(uv, sampleColor);
          float varianceScale = confidence >= 0.4 ? 8.0 : 3.0;
          float varianceLimit = confidence >= 0.4 ? 1.5 : 0.5;
          float sigma2 = useVariance
            ? clamp(varianceScale * (v0 + v1) / (scale * scale), 1e-8, varianceLimit)
            : threshold * threshold;
          // First-surface guides cannot describe a mirror's reflected details.
          sigma2 *= mix(0.12, 1.0, confidence);
          float weight = exp(-radius / 3.0 - dot(delta, delta) / (6.0 * sigma2));
          if (stepSize > 1.0 && sampleColor.a < 0.0) weight = 0.0;
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
        if (finalPass) gl_FragColor.rgb *= reflectance(vUv);
        gl_FragColor.a = finalPass ? texture2D(originalMap, vUv).a : min(65504.0, varianceSum / max(total*total, 1e-8));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const quad = new FullScreenQuad(material);
  const display = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { map: { value: null } },
    vertexShader: screenVertex,
    fragmentShader: `varying vec2 vUv; uniform sampler2D map;
      void main() {
        gl_FragColor = texture2D(map, vUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
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
          for (let i = 0; i < steps.length; i++) {
            const stage = intermediate[i % 2];
            stage.setSize(image.width, image.height);
            material.uniforms.stepSize.value = steps[i];
            material.uniforms.finalPass.value = i === steps.length - 1;
            renderer.setRenderTarget(stage);
            quad.render(renderer);
            material.uniforms.map.value = stage.texture;
          }
          // Complete the filter on its own pixel grid. Running the last pass
          // directly at display resolution mixes interpolated radiance with
          // nearest-sampled guides and makes upscaled silhouettes crawl.
          display.uniforms.map.value = material.uniforms.map.value;
          quad.material = display;
          renderer.setRenderTarget(output);
          quad.render(renderer);
        } else {
          clear();
          material.uniforms.finalPass.value = true;
          renderer.setRenderTarget(output);
          quad.render(renderer);
        }
      } finally {
        quad.material = material;
        display.uniforms.map.value = null;
        renderer.setRenderTarget(target);
      }
    },
    clear,
    dispose() {
      clear();
      quad.dispose();
      display.dispose();
      material.dispose();
    },
  };
}
