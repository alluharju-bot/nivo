import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { indirectSampleLimit } from './traceFireflies';

/** The second attachment accumulates the first surface's diffuse contribution.
 * Beauty is unchanged; specular/transmission is its exact remainder. Both use
 * the same paths, PDFs, MIS weights, opacity and indirect firefly clamp. */
export function splitTraceLobes(shader: string) {
  const main = 'void main() {';
  const direct =
    'vec3 directLightContribution( vec3 worldWo, SurfaceRecord surf, RenderState state, vec3 rayOrigin ) {';
  const scatter = 'scatterRec = bsdfSample( - ray.direction, surf );';
  const finish = 'gl_FragColor.a *= opacity;';
  for (const marker of [main, direct, scatter, finish])
    if (shader.split(marker).length !== 2)
      throw new Error('Renderöinnin pintakanavien versio ei vastaa sovellusta.');
  const contribution =
    /nivoAddRadiance\(gl_FragColor\.rgb, nivoIndirect, ([^;]+), nivoCameraPath\);/g;
  if ([...shader.matchAll(contribution)].length !== 7)
    throw new Error('Renderöinnin valokanavien versio ei vastaa sovellusta.');
  shader = `
    layout(location = 1) out vec4 nivoDiffuseOutput;
    vec3 nivoDiffuseDirect, nivoDiffuseIndirect, nivoPathDiffuse, nivoDirectShare;
    int nivoSurfaceNumber;
    ${shader}`;
  shader = shader.replace(
    direct,
    /* glsl */ `
    vec3 nivoDiffuseFraction(vec3 worldWo, vec3 worldWi, SurfaceRecord surf, vec3 total) {
      if (surf.volumeParticle) return vec3(1.0);
      vec3 wo = normalize(surf.normalInvBasis * worldWo);
      vec3 wi = normalize(surf.normalInvBasis * worldWi);
      vec3 diffuse = vec3(0.0);
      if (wi.z > 0.0) {
        vec3 wh = getHalfVector(wi, wo, surf.eta);
        diffuseEval(wo, wi, wh, surf, diffuse);
        diffuse *= 1.0 - surf.transmission;
        diffuse *= mix(1.0, sheenAlbedoScaling(wo, wi, surf), surf.sheen);
        diffuse += sheenColor(wo, wi, wh, surf) * surf.sheen;
        vec3 coatWo = normalize(surf.clearcoatInvBasis * worldWo);
        vec3 coatWi = normalize(surf.clearcoatInvBasis * worldWi);
        if (coatWi.z >= 0.0 && surf.clearcoat > 0.0) {
          vec3 halfVector = getHalfVector(coatWo, coatWi);
          diffuse *= 1.0 - surf.clearcoat * schlickFresnel(dot(coatWi, halfVector), 0.04);
        }
      }
      return clamp(diffuse / max(total, vec3(1e-20)), 0.0, 1.0);
    }
    ${direct}
    nivoDirectShare = vec3(0.0);
  `,
  );
  for (const [marker, direction] of [
    [
      'float lightMaterialPdf = bsdfResult( worldWo, lightRec.direction, surf, sampleColor );',
      'lightRec.direction',
    ],
    [
      'float envMaterialPdf = bsdfResult( worldWo, envDirection, surf, sampleColor );',
      'envDirection',
    ],
  ]) {
    if (shader.split(marker).length !== 2)
      throw new Error('Renderöinnin suoran valon kanavia ei voitu valmistella.');
    shader = shader.replace(
      marker,
      `${marker}\nnivoDirectShare = nivoDiffuseFraction(worldWo, ${direction}, surf, sampleColor);`,
    );
  }
  return shader
    .replace(
      main,
      `${main}\nnivoDiffuseDirect = nivoDiffuseIndirect = nivoPathDiffuse = vec3(0.0); nivoSurfaceNumber = 0;`,
    )
    .replace(
      scatter,
      `${scatter}\nnivoSurfaceNumber++; if (nivoSurfaceNumber == 1) nivoPathDiffuse = nivoDiffuseFraction(-ray.direction, scatterRec.direction, surf, scatterRec.color);`,
    )
    .replace(contribution, (_, value: string) => {
      const share = value.includes('directLightContribution')
        ? '(nivoSurfaceNumber == 1 ? nivoDirectShare : nivoPathDiffuse)'
        : value.includes('surf.emission')
          ? '(nivoSurfaceNumber == 1 ? vec3(0.0) : nivoPathDiffuse)'
          : 'nivoPathDiffuse';
      return `{ vec3 incoming = ${value};
        nivoAddRadiance(gl_FragColor.rgb, nivoIndirect, incoming, nivoCameraPath);
        nivoAddRadiance(nivoDiffuseDirect, nivoDiffuseIndirect, incoming * ${share}, nivoCameraPath);
      }`;
    })
    .replace(
      finish,
      `${finish}
      float lobeClamp = min(1.0, ${indirectSampleLimit.toFixed(1)} / max(max(nivoIndirect.r, max(nivoIndirect.g, nivoIndirect.b)), 1e-8));
      nivoDiffuseOutput = vec4(min(gl_FragColor.rgb, nivoDiffuseDirect + nivoDiffuseIndirect * lobeClamp), gl_FragColor.a);
    `,
    );
}

/** Preserve the library's float-blend fallback and transparent-background path.
 * Targets own both attachments; the library's dispose/reset handles them too. */
export function prepareLobeTargets(tracer: WebGLPathTracer) {
  type Internal = {
    _primaryTarget: THREE.WebGLRenderTarget;
    _blendTargets: THREE.WebGLRenderTarget[];
    _blendQuad: { material: THREE.ShaderMaterial; render: (r: THREE.WebGLRenderer) => void };
    _alpha: boolean;
    reset(): void;
    material: THREE.ShaderMaterial;
  };
  const internal = (tracer as unknown as { _pathTracer: Internal })._pathTracer;
  const replace = (old: THREE.WebGLRenderTarget) => {
    const next = new THREE.WebGLRenderTarget(old.width, old.height, {
      type: THREE.FloatType,
      count: 2,
      depthBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    old.dispose();
    return next;
  };
  internal._primaryTarget = replace(internal._primaryTarget);
  internal._blendTargets = internal._blendTargets.map(replace);
  const reset = internal.reset.bind(internal);
  internal.reset = () => {
    if (internal.material.uniforms.nivoAdaptive) {
      internal.material.uniforms.nivoAdaptive.value = false;
      internal.material.uniforms.nivoNoiseVariance.value = null;
    }
    // Opaque float blending needs only the primary accumulator. The upstream
    // reset eagerly allocates both fallback targets even when never used.
    // Keep them at 1×1 until the alpha/float-blend fallback actually needs them.
    const { width, height } = internal._primaryTarget;
    internal._blendTargets.forEach((t) =>
      t.setSize(internal._alpha ? width : 1, internal._alpha ? height : 1),
    );
    reset();
  };
  const quad = internal._blendQuad,
    material = quad.material;
  const source = material.fragmentShader;
  const body = source.slice(
    source.indexOf('void main() {') + 'void main() {'.length,
    source.lastIndexOf('}'),
  );
  material.uniforms.diffuse1 = { value: null };
  material.uniforms.diffuse2 = { value: null };
  material.fragmentShader =
    source.slice(0, source.indexOf('void main() {')) +
    `
    uniform sampler2D diffuse1, diffuse2;
    layout(location = 1) out vec4 nivoDiffuseOutput;
    void main() { ${body}
      ${body.replaceAll('target1', 'diffuse1').replaceAll('target2', 'diffuse2').replaceAll('gl_FragColor', 'nivoDiffuseOutput').replaceAll('color1', 'diffuseColor1').replaceAll('color2', 'diffuseColor2').replaceAll('invOpacity', 'diffuseInvOpacity').replaceAll('totalAlpha', 'diffuseTotalAlpha')}
    }`;
  const render = quad.render.bind(quad);
  quad.render = (renderer) => {
    const targets = [internal._primaryTarget, ...internal._blendTargets];
    material.uniforms.diffuse1.value = targets.find(
      (t) => t.texture === material.uniforms.target1.value,
    )?.textures[1];
    material.uniforms.diffuse2.value = targets.find(
      (t) => t.texture === material.uniforms.target2.value,
    )?.textures[1];
    render(renderer);
  };
  material.needsUpdate = true;
}
