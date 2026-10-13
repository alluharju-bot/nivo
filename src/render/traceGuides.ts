import * as THREE from 'three';

export type DenoiseGuides = { albedo: THREE.Texture; normal: THREE.Texture };

/** Raster guides preserve real texture/normal detail when smoothing stochastic
 * radiance. Built only after a camera/material/size change, never per sample.
 * Borrow source geometry/maps; own only two small guide materials per material. */
export function traceGuides() {
  let albedo: THREE.WebGLRenderTarget | undefined, normal: THREE.WebGLRenderTarget | undefined;
  let dirty = true;
  const materials = new Map<
    THREE.Material,
    { key: string; color: THREE.MeshBasicMaterial; normal: THREE.MeshNormalMaterial }
  >();
  const releaseTargets = () => {
    albedo?.dispose();
    normal?.dispose();
    albedo = normal = undefined;
    dirty = true;
  };
  const release = () => {
    releaseTargets();
    materials.forEach((m) => {
      m.color.dispose();
      m.normal.dispose();
    });
    materials.clear();
    dirty = true;
  };
  return {
    invalidate() {
      dirty = true;
    },
    ensure(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
      width: number,
      height: number,
    ): DenoiseGuides {
      if (albedo?.width !== width || albedo?.height !== height) dirty = true;
      if (!dirty && albedo && normal) return { albedo: albedo.texture, normal: normal.texture };
      releaseTargets();
      const retired: { color: THREE.Material; normal: THREE.Material }[] = [];
      const active = new Set<THREE.Material>();
      albedo = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      normal = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      const saved: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
      const omitted: THREE.Object3D[] = [];
      const pair = (source: THREE.Material) => {
        active.add(source);
        const existing = materials.get(source);
        const m = source as THREE.MeshPhysicalMaterial;
        const key = JSON.stringify([
          m.color?.getHex(),
          m.map?.uuid,
          m.alphaMap?.uuid,
          m.alphaTest,
          m.side,
          m.vertexColors,
          m.roughness,
          m.transmission,
          m.flatShading,
          m.normalMap?.uuid,
          m.normalScale?.toArray(),
          m.normalMapType,
          m.bumpMap?.uuid,
          m.bumpScale,
        ]);
        if (existing?.key === key) return existing;
        if (existing) retired.push(existing);
        const color = new THREE.MeshBasicMaterial({
          color: m.color ?? '#ffffff',
          map: m.map ?? null,
          alphaMap: m.alphaMap ?? null,
          alphaTest: m.alphaTest,
          side: m.side,
          vertexColors: m.vertexColors,
          toneMapped: false,
        });
        // Glass/reflections have detail beyond the first visible surface. Use
        // conservative radiance filtering there instead of trusting its albedo.
        const confidence =
          (m.transmission ?? 0) > 0.05 ? 0 : Math.max(0.15, Math.min(1, m.roughness ?? 1));
        color.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>\ngl_FragColor.a = ${confidence.toFixed(4)};`,
          );
        };
        color.customProgramCacheKey = () => `guide:${confidence.toFixed(4)}`;
        const n = new THREE.MeshNormalMaterial({
          side: m.side,
          flatShading: m.flatShading ?? false,
          normalMap: m.normalMap ?? null,
          normalScale: m.normalScale?.clone() ?? new THREE.Vector2(1, 1),
          normalMapType: m.normalMapType ?? THREE.TangentSpaceNormalMap,
          bumpMap: m.bumpMap ?? null,
          bumpScale: m.bumpScale ?? 1,
        });
        n.onBeforeCompile = (shader) => {
          shader.vertexShader = `varying float vGuideDepth;\n${shader.vertexShader}`.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\nvGuideDepth = log2(1.0 + max(0.0, -mvPosition.z));',
          );
          shader.fragmentShader = `varying float vGuideDepth;\n${shader.fragmentShader}`.replace(
            /}\s*$/,
            'gl_FragColor.a = vGuideDepth;\n}',
          );
        };
        n.customProgramCacheKey = () => 'guide-depth';
        const result = { key, color, normal: n };
        materials.set(source, result);
        return result;
      };
      scene.traverseVisible((object) => {
        if (object instanceof THREE.Mesh) {
          saved.push({ mesh: object, material: object.material });
          for (const m of Array.isArray(object.material) ? object.material : [object.material])
            pair(m);
        } else if (
          object instanceof THREE.Sprite ||
          object instanceof THREE.Line ||
          object instanceof THREE.Points
        )
          omitted.push(object);
      });
      const target = renderer.getRenderTarget(),
        background = scene.background,
        override = scene.overrideMaterial;
      const clear = renderer.getClearColor(new THREE.Color()),
        alpha = renderer.getClearAlpha();
      const shadows = renderer.shadowMap.autoUpdate,
        shadowUpdate = renderer.shadowMap.needsUpdate;
      try {
        scene.background = null;
        scene.overrideMaterial = null;
        renderer.setClearColor(0, 0);
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
        omitted.forEach((object) => {
          object.visible = false;
        });
        for (const mode of ['color', 'normal'] as const) {
          for (const { mesh, material } of saved)
            mesh.material = Array.isArray(material)
              ? material.map((m) => pair(m)[mode])
              : pair(material)[mode];
          renderer.setRenderTarget(mode === 'color' ? albedo : normal);
          renderer.render(scene, camera);
        }
        dirty = false;
      } finally {
        saved.forEach(({ mesh, material }) => {
          mesh.material = material;
        });
        omitted.forEach((object) => {
          object.visible = true;
        });
        scene.background = background;
        scene.overrideMaterial = override;
        renderer.shadowMap.autoUpdate = shadows;
        renderer.shadowMap.needsUpdate = shadowUpdate;
        renderer.setClearColor(clear, alpha);
        renderer.setRenderTarget(target);
        for (const [source, pair] of materials)
          if (!active.has(source)) {
            retired.push(pair);
            materials.delete(source);
          }
        retired.forEach((pair) => {
          pair.color.dispose();
          pair.normal.dispose();
        });
      }
      return { albedo: albedo.texture, normal: normal.texture };
    },
    reset: releaseTargets,
    clear: release,
    dispose: release,
  };
}
