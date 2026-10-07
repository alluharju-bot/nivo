import * as THREE from 'three';

/** Array layers are image sources, not parts. Keep GPU allocation bounded on large projects. */
export function traceTexturePlan(count: number, largest: number, layerLimit: number) {
  if (count > layerLimit)
    throw new Error(
      `Mallissa on ${count} eri materiaalikuvaa. Näytönohjain tukee tarkentuvassa kuvassa ${layerLimit} kuvaa. Nopea esikatselu säilyy käytettävissä.`,
    );
  const budget = 128 * 1024 * 1024;
  const byMemory = 2 ** Math.floor(Math.log2(Math.sqrt(budget / (Math.max(count, 1) * 4))));
  const native = 2 ** Math.ceil(Math.log2(Math.max(largest, 1)));
  const size = Math.max(1, Math.min(1024, native, byMemory));
  return { count, size, bytes: Math.max(count, 1) * size * size * 4 };
}

export function configureTraceTextures(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  tracer: { textureSize: THREE.Vector2 },
) {
  const sources = new Set<string>();
  let largest = 1;
  scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials)
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        sources.add(`${value.source.uuid}:${value.colorSpace}`);
        const image = value.image;
        largest = Math.max(
          largest,
          image?.naturalWidth ?? image?.width ?? 1,
          image?.naturalHeight ?? image?.height ?? 1,
        );
      }
  });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const plan = traceTexturePlan(
    sources.size,
    largest,
    gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
  );
  tracer.textureSize.set(plan.size, plan.size);
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
