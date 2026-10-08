import { DenoiseMaterial } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { WebGLRenderer, Texture } from 'three';

/** A restrained edge-aware display filter. The accumulated radiance is never
 * filtered, so detail continues to converge and the user can compare the raw image. */
export function traceDenoise() {
  const material = new DenoiseMaterial({ sigma: 1.5, kSigma: 1, threshold: 0.06 });
  const quad = new FullScreenQuad(material);
  return {
    draw(renderer: WebGLRenderer, map: Texture, samples: number) {
      // As accumulation converges, reduce the spatial filter so fine wood
      // grain, grout and small normal-map details do not stay permanently soft.
      const confidence = Math.min(1, Math.max(0, Math.log2(Math.max(8, samples) / 8) / 6));
      material.sigma = 1.5 - confidence * 0.65;
      material.threshold = 0.06 - confidence * 0.045;
      material.map = map;
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      quad.render(renderer);
      renderer.setRenderTarget(target);
    },
    dispose() {
      quad.dispose();
      material.dispose();
    },
  };
}
