import type { Material } from 'three';

/** Raster-only separation; CAD coordinates and ray picking stay exact. */
export function prioritizeSurface(material: Material, outline = false) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.nivoSurfaceDepthBias = { value: (outline ? 34 : 32) / 16777216 };
    // Perspective log depth writes gl_FragDepth, overriding polygonOffset.
    // A few depth-buffer steps work for every planar profile, including BReps.
    shader.fragmentShader =
      'uniform float nivoSurfaceDepthBias;\n' +
      shader.fragmentShader.replace(
        '#include <logdepthbuf_fragment>',
        `#include <logdepthbuf_fragment>
      #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
        gl_FragDepth = max(0.0, gl_FragDepth - nivoSurfaceDepthBias);
      #endif`,
      );
  };
  material.customProgramCacheKey = () => `${key}:nivo-surface-depth`;
}
