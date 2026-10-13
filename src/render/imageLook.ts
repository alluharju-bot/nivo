import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { screenVertex } from './traceDenoise';
import type { RenderSettings } from './scene';

export type ImageLookSettings = Pick<RenderSettings, 'look' | 'lookStrength'>;
export function stylizedLook(settings: ImageLookSettings) {
  return (
    ['soft', 'dream', 'mist'].includes(settings.look ?? '') && (settings.lookStrength ?? 0.5) > 0
  );
}

/** Optional display-only diffusion. Keep a sharp base image; blur only a small
 * highlight layer. The two bloom buffers are bounded to 512 px on the long side.
 * Standard/filmic views bypass all extra render targets and passes. */
export function imageLook(initial: ImageLookSettings = {}) {
  let settings = { ...initial };
  let a: THREE.WebGLRenderTarget | undefined, b: THREE.WebGLRenderTarget | undefined;
  let raster: THREE.WebGLRenderTarget | undefined;
  const blur = new THREE.ShaderMaterial({
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    vertexShader: screenVertex,
    uniforms: {
      map: { value: null },
      direction: { value: new THREE.Vector2() },
      extract: { value: false },
      exposure: { value: 1 },
    },
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform sampler2D map; uniform vec2 direction; uniform bool extract; uniform float exposure;
      vec3 read(vec2 uv) {
        vec3 c = texture2D(map, uv).rgb;
        if (!extract) return c;
        float y = dot(c, vec3(0.2126, 0.7152, 0.0722)) * exposure;
        return c * smoothstep(0.55, 2.5, y);
      }
      void main() {
        vec3 c = read(vUv) * 0.227027;
        c += (read(vUv + direction * 1.384615) + read(vUv - direction * 1.384615)) * 0.316216;
        c += (read(vUv + direction * 3.230769) + read(vUv - direction * 3.230769)) * 0.070270;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const composite = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    vertexShader: screenVertex,
    uniforms: {
      map: { value: null },
      glowMap: { value: null },
      glow: { value: 0 },
      haze: { value: 0 },
      exposure: { value: 1 },
    },
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform sampler2D map, glowMap; uniform float glow, haze, exposure;
      void main() {
        vec4 base = texture2D(map, vUv);
        vec3 diffusion = texture2D(glowMap, vUv).rgb;
        vec3 c = base.rgb + diffusion * glow;
        // This is photographic veiling, not smoke geometry or extra lighting.
        c = mix(c, vec3(0.72, 0.77, 0.80) / max(exposure, 0.01), haze);
        gl_FragColor = vec4(c, base.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const plain = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(plain);
  const clear = () => {
    a?.dispose();
    b?.dispose();
    raster?.dispose();
    a = b = raster = undefined;
  };
  const target = (w: number, h: number, depth = false) =>
    new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: depth });
  const draw = (renderer: THREE.WebGLRenderer, map: THREE.Texture) => {
    const previous = renderer.getRenderTarget();
    try {
      if (!stylizedLook(settings)) {
        plain.map = map;
        quad.material = plain;
        renderer.setRenderTarget(null);
        quad.render(renderer);
        return;
      }
      const size = map.image as { width: number; height: number };
      const scale = Math.min(0.25, 512 / Math.max(size.width, size.height));
      const w = Math.max(1, Math.round(size.width * scale)),
        h = Math.max(1, Math.round(size.height * scale));
      a ??= target(w, h);
      b ??= target(w, h);
      a.setSize(w, h);
      b.setSize(w, h);
      quad.material = blur;
      blur.uniforms.map.value = map;
      blur.uniforms.extract.value = true;
      blur.uniforms.exposure.value = renderer.toneMappingExposure;
      blur.uniforms.direction.value.set(1 / w, 0);
      renderer.setRenderTarget(a);
      quad.render(renderer);
      blur.uniforms.map.value = a.texture;
      blur.uniforms.extract.value = false;
      blur.uniforms.direction.value.set(0, 1 / h);
      renderer.setRenderTarget(b);
      quad.render(renderer);
      quad.material = composite;
      const amount = settings.lookStrength ?? 0.5;
      composite.uniforms.map.value = map;
      composite.uniforms.glowMap.value = b.texture;
      composite.uniforms.glow.value =
        amount * (settings.look === 'dream' ? 0.55 : settings.look === 'soft' ? 0.3 : 0.16);
      composite.uniforms.haze.value =
        amount * (settings.look === 'mist' ? 0.34 : settings.look === 'dream' ? 0.1 : 0);
      composite.uniforms.exposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
  };
  return {
    get active() {
      return stylizedLook(settings);
    },
    configure(next: ImageLookSettings) {
      settings = { ...next };
      if (!stylizedLook(settings)) clear();
    },
    draw,
    renderScene(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
      maxPixels = 3_000_000,
    ) {
      if (!stylizedLook(settings)) {
        renderer.render(scene, camera);
        return;
      }
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const scale = Math.min(1, Math.sqrt(maxPixels / (size.x * size.y)));
      const w = Math.max(1, Math.round(size.x * scale)),
        h = Math.max(1, Math.round(size.y * scale));
      raster ??= target(w, h, true);
      raster.setSize(w, h);
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(raster);
        renderer.render(scene, camera);
        draw(renderer, raster.texture);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    clear,
    dispose() {
      clear();
      quad.dispose();
      blur.dispose();
      composite.dispose();
      plain.dispose();
    },
  };
}
export type ImageLook = ReturnType<typeof imageLook>;
