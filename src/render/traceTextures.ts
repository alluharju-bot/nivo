import * as THREE from 'three';
import { packedTexturePlan, textureSpec } from './traceTextureAtlas';

/** Count shared image sources, not parts, and pack them within the GPU budget. */
export const traceTexturePlan = packedTexturePlan;

export function configureTraceTextures(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  tracer: { textureSize: THREE.Vector2 },
) {
  const sources = new Map<string, ReturnType<typeof textureSpec>>();
  scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials)
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        sources.set(`${value.source.uuid}:${value.colorSpace}`, textureSpec(value));
      }
  });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const plan = traceTexturePlan(
    [...sources.values()],
    gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
    renderer.capabilities.maxTextureSize,
  );
  tracer.textureSize.set(plan.size, plan.size);
  renderer.domElement.dataset.traceTextureSize = String(plan.size);
  renderer.domElement.dataset.traceTextureLayers = String(plan.count);
  renderer.domElement.dataset.traceTextureBytes = String(plan.bytes);
  return plan;
}

export function checkTraceUpload(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext();
  const error = gl.getError();
  if (error === gl.NO_ERROR) return;
  if (error === gl.OUT_OF_MEMORY)
    throw new Error(
      'Näytönohjain ei voinut varata tarkentuvan kuvan muistia. Kokeile rajattua osavalintaa tai nopeaa esikatselua.',
    );
  throw new Error(
    `Tarkentuvan kuvan valmistelu epäonnistui (WebGL ${error}). Kokeile käynnistää tarkennus uudelleen. Nopea esikatselu toimii edelleen.`,
  );
}
