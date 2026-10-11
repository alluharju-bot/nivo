import * as THREE from 'three';

export const faceColors = {
  selected: '#f3a43b',
  tool: '#159bd7',
  hover: '#65bdda',
};

/** Selection is an unlit UI mark, independent of a face's wood, metal or glass. */
export function selectedFaceMaterial() {
  const material = new THREE.MeshBasicMaterial({ color: faceColors.selected, toneMapped: false });
  material.userData.faceSelection = true;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.selectionPixelRatio = { value: renderer.getPixelRatio() };
    shader.fragmentShader = `uniform float selectionPixelRatio;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 cell = mod(gl_FragCoord.xy / selectionPixelRatio, 8.0) - 4.0;
      float mark = 1.0 - smoothstep(0.8, 1.5, length(cell));
      diffuseColor.rgb *= mix(1.0, 0.70, mark);`,
    );
  };
  material.customProgramCacheKey = () => 'nivo-selected-face';
  return material;
}
