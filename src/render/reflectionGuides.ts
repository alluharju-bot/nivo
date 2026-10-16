import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { screenVertex } from './traceDenoise';

/** Center-ray features beyond a glossy surface, using the very same BVH,
 * textures and normal maps as the integrator. Evaluated once per settled view.
 * Transmission, silhouettes and unresolved chains stay conservatively filtered. */
export function reflectionGuides() {
  let target: THREE.WebGLRenderTarget | undefined;
  let material: THREE.ShaderMaterial | undefined;
  let source: THREE.ShaderMaterial | undefined;
  let dirty = true;
  const quad = new FullScreenQuad();
  const reset = () => {
    target?.dispose();
    target = undefined;
    dirty = true;
  };
  return {
    invalidate() {
      dirty = true;
    },
    ensure(renderer: THREE.WebGLRenderer, tracer: WebGLPathTracer, width: number, height: number) {
      const current = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
        ._pathTracer.material;
      if (current !== source) {
        material?.dispose();
        material = undefined;
        source = current;
        dirty = true;
      }
      if (!material) {
        const shader = current.fragmentShader;
        const integrator = shader.indexOf('void nivoTracePath() {');
        if (integrator < 0)
          throw new Error('Renderöinnin heijastusohjeiden versio ei vastaa sovellusta.');
        material = new THREE.ShaderMaterial({
          uniforms: current.uniforms,
          defines: { ...current.defines, FEATURE_DOF: 0, FEATURE_FOG: 0 },
          vertexShader: screenVertex,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          fragmentShader:
            shader
              // Only surface/BVH helpers are needed. Do not send the unused
              // full lighting integrator through a second driver compilation.
              .slice(0, integrator)
              .replace('vec2 jitteredUv = vUv + (ruv - 0.5) * ssd;', 'vec2 jitteredUv = vUv;') +
            /* glsl */ `
            void main() {
              gl_FragColor = nivoDiffuseOutput = vec4(0.0);
              rng_initialize(gl_FragCoord.xy, 0);
              sobolPixelIndex = (uint(gl_FragCoord.x) << 16) | uint(gl_FragCoord.y);
              sobolPathIndex = 0u;
              Ray ray = getCameraRay();
              RenderState state = initRenderState();
              float distance = 0.0;
              int surfaces = 0;
              for (int i = 0; i < 8; i++) {
                SurfaceHit hit;
                if (traceScene(ray, state.fogMaterial, hit) == NO_HIT) return;
                uint index = uTexelFetch1D(materialIndexAttribute, hit.faceIndices.x).r;
                Material m = readMaterialInfo(materials, index);
                SurfaceRecord surf;
                if (getSurfaceRecord(m, hit, attributesArray, 0.0, surf) == SKIP_SURFACE) {
                  ray.origin = stepRayOrigin(ray.origin, ray.direction, -hit.faceNormal, hit.dist);
                  continue;
                }
                if (surf.volumeParticle || surf.transmission > 0.05) return;
                distance += hit.dist;
                // Material roughness is squared in SurfaceRecord.
                if (surfaces == 0 && surf.roughness >= 0.16) return;
                if (surfaces > 0 && (surf.metalness < 0.5 || surf.roughness >= 0.16)) {
                  gl_FragColor = vec4(surf.color, 1.0);
                  vec3 n = transpose(mat3(cameraWorldMatrix)) * surf.normal;
                  nivoDiffuseOutput = vec4(n * 0.5 + 0.5, distance * 0.001);
                  return;
                }
                if (surfaces >= 3) return;
                ray.origin = stepRayOrigin(ray.origin, ray.direction, surf.faceNormal, hit.dist);
                ray.direction = normalize(reflect(ray.direction, surf.normal));
                surfaces++;
              }
            }`,
        });
      }
      if (!target || target.width !== width || target.height !== height) {
        reset();
        target = new THREE.WebGLRenderTarget(width, height, {
          count: 2,
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        });
        // Reflected path distances use a relative 2% discontinuity test, not
        // the primary guide's precise planar test. Half float is sufficient.
        target.textures[1].type = THREE.HalfFloatType;
      }
      if (dirty) {
        const defines = { ...current.defines, FEATURE_DOF: 0, FEATURE_FOG: 0 };
        if (JSON.stringify(material.defines) !== JSON.stringify(defines)) {
          material.defines = defines;
          material.needsUpdate = true;
        }
        const previous = renderer.getRenderTarget();
        try {
          quad.material = material;
          renderer.setRenderTarget(target);
          quad.render(renderer);
          dirty = false;
        } finally {
          renderer.setRenderTarget(previous);
        }
      }
      return { albedo: target.texture, normal: target.textures[1] };
    },
    reset,
    clear() {
      reset();
      material?.dispose();
      material = undefined;
      source = undefined;
    },
    dispose() {
      reset();
      material?.dispose();
      material = undefined;
      source = undefined;
      quad.dispose();
    },
  };
}
