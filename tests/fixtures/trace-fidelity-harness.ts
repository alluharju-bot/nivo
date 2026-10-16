import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { configureTraceTextures } from '../../src/render/traceTextures';
import { traceResources } from '../../src/render/traceResources';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceGuides } from '../../src/render/traceGuides';
import { traceLighting } from '../../src/render/traceLighting';
import { reflectionGuides } from '../../src/render/reflectionGuides';
import { screenVertex } from '../../src/render/traceDenoise';

export async function textureFidelity(woodUrl: string, seams = false) {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(256, 256);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const tracer = new WebGLPathTracer(renderer),
    resources = traceResources(tracer);
  const wood = await new THREE.TextureLoader().loadAsync(woodUrl);
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.generateMipmaps = false;
  wood.minFilter = wood.magFilter = THREE.LinearFilter;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const size = 1024,
    bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Dark one-texel grain and fine bright grain; linear RGBA8 used to erase both.
      const v = y < size / 2 ? 12 + (x % 8) * 2 : 120 + (x % 4) * 18;
      bytes.set([v, v, v, 255], (y * size + x) * 4);
    }
  const grain = new THREE.DataTexture(bytes, size, size);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.minFilter = grain.magFilter = THREE.LinearFilter;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100));
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.z = 100;
  const output = new THREE.WebGLRenderTarget(256, 256, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      map: { value: grain as THREE.Texture },
      atlas: { value: null },
      useAtlas: { value: false },
      sourceIndex: { value: 0 },
      region: {
        value: seams
          ? new THREE.Vector4(-0.002, -0.002, 0.004, 0.004)
          : new THREE.Vector4(0.123, 0, 0.25, 1),
      },
    },
    vertexShader: screenVertex,
    fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform sampler2DArray atlas; uniform bool useAtlas;
      uniform float sourceIndex; uniform vec4 region;
      void main() { vec2 uv = region.xy + vUv * region.zw;
        gl_FragColor = useAtlas ? texture(atlas, vec3(uv, sourceIndex)) : texture2D(map, uv); }`,
  });
  const quad = new FullScreenQuad(copy),
    guides = traceGuides(),
    results = [];
  const allocated: THREE.Material[] = [];
  try {
    for (const input of [grain, wood])
      for (const count of [1, 39]) {
        const materials = Array.from({ length: count }, (_, index) => {
          const filler = index ? bytes.slice(0, 512 * 512 * 4) : undefined;
          if (filler)
            for (let i = 0; i < filler.length; i += 4)
              for (let c = 0; c < 3; c++) filler[i + c] = (filler[i + c] + index * 5) % 256;
          // Distinct neighboring tiles make accidental atlas-edge bleed visible.
          const map: THREE.Texture =
            index === 0 ? input.clone() : new THREE.DataTexture(filler!, 512, 512);
          map.uuid = String(count - index).padStart(5, '0');
          map.minFilter = map.magFilter = THREE.LinearFilter;
          map.wrapS = map.wrapT = THREE.RepeatWrapping;
          map.needsUpdate = true;
          // Additional real sources in a mixed palette, without duplicating CPU image memory.
          map.source = new THREE.Source(map.image);
          const m = new THREE.MeshPhysicalMaterial({ map });
          allocated.push(m);
          return m;
        });
        mesh.material = materials;
        configureTraceTextures(scene, renderer, tracer);
        tracer.setScene(scene, camera);
        const mat = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
          ._pathTracer.material;
        const selected = seams && count > 1 ? 1 : 0;
        copy.uniforms.map.value = materials[selected].map!;
        copy.uniforms.sourceIndex.value = selected;
        copy.uniforms.atlas.value = mat.uniforms.textures.value;
        // Packed production sampler is copied from the tracer, not reimplemented in the test.
        if (mat.uniforms.nivoTextureLayout) {
          copy.uniforms.nivoTextureLayout = mat.uniforms.nivoTextureLayout;
          copy.defines.NIVO_TEXTURE_SLOTS = mat.defines.NIVO_TEXTURE_SLOTS;
          copy.fragmentShader = copy.fragmentShader
            .replace('void main()', `${mat.userData.textureSampler}\nvoid main()`)
            .replace(
              'texture(atlas, vec3(uv, sourceIndex))',
              'nivoTexture(atlas, vec3(uv, sourceIndex))',
            );
          copy.needsUpdate = true;
        }
        const read = () => {
          const p = new Float32Array(256 * 256 * 4);
          renderer.setRenderTarget(output);
          quad.render(renderer);
          renderer.readRenderTargetPixels(output, 0, 0, 256, 256, p);
          return p;
        };
        copy.uniforms.useAtlas.value = false;
        const expected = read();
        copy.uniforms.useAtlas.value = true;
        const actual = read();
        let darkError = 0,
          error = 0,
          energy = 0,
          detail = 0,
          referenceDetail = 0;
        for (let i = 0; i < actual.length; i += 4) {
          error += (actual[i] - expected[i]) ** 2;
          energy += expected[i] ** 2;
          if (expected[i] < 0.02)
            darkError = Math.max(darkError, Math.abs(actual[i] - expected[i]));
          if (i % 1024 < 1020) {
            detail += (actual[i + 4] - actual[i]) ** 2;
            referenceDetail += (expected[i + 4] - expected[i]) ** 2;
          }
        }
        results.push({
          material: input === grain ? 'grain' : 'oak',
          count,
          relativeError: Math.sqrt(error / energy),
          darkError,
          detail: detail / referenceDetail,
          atlasBytes: Number(renderer.domElement.dataset.traceTextureBytes),
        });
        // Clear the test shader before the next variant.
        if (mat.uniforms.nivoTextureLayout) {
          copy.fragmentShader = copy.fragmentShader.replace(`${mat.userData.textureSampler}\n`, '');
          copy.fragmentShader = copy.fragmentShader.replace(
            'nivoTexture(atlas, vec3(uv, sourceIndex))',
            'texture(atlas, vec3(uv, sourceIndex))',
          );
        }
      }
  } finally {
    resources.dispose();
    guides.dispose();
    quad.dispose();
    copy.dispose();
    output.dispose();
    allocated.forEach((m) => {
      (m as THREE.MeshPhysicalMaterial).map?.dispose();
      m.dispose();
    });
    mesh.geometry.dispose();
    grain.dispose();
    wood.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return results;
}

/** Actual integrator, material maps, raster guides and production denoiser. */
export async function renderFidelity(urls: string[], samples = 4096) {
  const size = 256,
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const maps = await Promise.all(urls.map((url) => new THREE.TextureLoader().loadAsync(url)));
  maps[0].colorSpace = THREE.SRGBColorSpace;
  const tracer = new WebGLPathTracer(renderer),
    resources = traceResources(tracer);
  tracer.renderToCanvas = false;
  tracer.renderDelay = 0;
  tracer.bounces = 8;
  tracer.filterGlossyFactor = 0;
  tracer.tiles.set(1, 1);
  resources.resize(size, size);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.2, 0.2, 0.2);
  const envWidth = 512,
    envHeight = 256,
    envBytes = new Float32Array(envWidth * envHeight * 4);
  for (let y = 0; y < envHeight; y++)
    for (let x = 0; x < envWidth; x++) {
      const stripe = x % 32 < 16 ? 1 : 0.12,
        light = y > 90 && y < 170 && x > 180 && x < 230 ? 5 : stripe;
      envBytes.set([light, light, light, 1], (y * envWidth + x) * 4);
    }
  const environment = new THREE.DataTexture(
    envBytes,
    envWidth,
    envHeight,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.needsUpdate = true;
  scene.environment = environment;
  const wood = new THREE.MeshPhysicalMaterial({
    map: maps[0],
    normalMap: maps[1],
    roughnessMap: maps[2],
    roughness: 0.8,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xf5f5f5,
    metalness: 1,
    roughness: 0.055,
  });
  const block: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> = new THREE.Mesh(
    new THREE.BoxGeometry(100, 140, 35),
    wood,
  );
  scene.add(block);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), wood);
  wall.position.z = 400;
  wall.rotation.y = Math.PI;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  camera.position.set(80, 50, 270);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const lighting = traceLighting(),
    guides = traceGuides(),
    reflected = reflectionGuides();
  const output = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { map: { value: null as THREE.Texture | null } },
    vertexShader: screenVertex,
    fragmentShader:
      `varying vec2 vUv; uniform sampler2D map; void main() { gl_FragColor = texture2D(map,vUv); #include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`.replace(
        '; #include',
        ';\n#include',
      ),
  });
  const quad = new FullScreenQuad(copy),
    results = [];
  const capture = (texture: THREE.Texture) => {
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    copy.uniforms.map.value = texture;
    quad.render(renderer);
    const png = renderer.domElement.toDataURL();
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    return png;
  };
  try {
    for (const variant of ['oak', 'chrome', 'chrome-reflection', 'brushed-reflection']) {
      const metal = variant !== 'oak';
      block.material = metal ? chrome : wood;
      if (metal) {
        block.geometry.dispose();
        block.geometry = new THREE.SphereGeometry(65, 64, 32);
      }
      if (variant.includes('reflection')) scene.add(wall);
      chrome.roughness = variant === 'brushed-reflection' ? 0.22 : 0.055;
      lighting.clear();
      guides.clear();
      reflected.clear();
      configureTraceTextures(scene, renderer, tracer);
      tracer.setScene(scene, camera);
      if (!metal) configureEmitterSampling(tracer);
      renderer.setRenderTarget(output);
      renderer.render(scene, camera);
      const preview = capture(output.texture);
      const start = performance.now();
      const checkpoints = [],
        pixels: { raw: Float32Array; filtered: Float32Array }[] = [];
      while (tracer.samples < samples) {
        for (let j = 0; j < 4 && tracer.samples < samples; j++) {
          tracer.renderSample();
          lighting.observe(renderer, tracer.target, tracer.samples);
        }
        if ([64, 256, 1024, samples].includes(tracer.samples)) {
          const raw = new Float32Array(size * size * 4),
            filtered = raw.slice();
          renderer.readRenderTargetPixels(tracer.target, 0, 0, size, size, raw);
          const guide = guides.ensure(renderer, scene, camera, size, size);
          guide.reflection = reflected.ensure(renderer, tracer, size, size);
          lighting.draw(renderer, tracer.target, tracer.samples, guide, output);
          renderer.readRenderTargetPixels(output, 0, 0, size, size, filtered);
          let delta = 0,
            energy = 0;
          for (let i = 0; i < raw.length; i += 4) {
            delta += (filtered[i] - raw[i]) ** 2;
            energy += raw[i] ** 2;
          }
          checkpoints.push({
            samples: tracer.samples,
            elapsed: performance.now() - start,
            relativeChange: Math.sqrt(delta / energy),
            raw: capture(tracer.target.texture),
            filtered: capture(output.texture),
          });
          pixels.push({ raw, filtered });
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const truth = pixels.at(-1)!.raw;
      const fidelity = pixels.map((p) => {
        const result: Record<string, number> = {};
        for (const kind of ['raw', 'filtered'] as const) {
          let error = 0,
            signal = 0,
            detail = 0,
            expectedDetail = 0;
          for (let y = 75; y < 180; y++)
            for (let x = 75; x < 180; x++) {
              const i = (y * size + x) * 4;
              error += (p[kind][i] - truth[i]) ** 2;
              signal += truth[i] ** 2;
              detail += (p[kind][i + 4] - p[kind][i]) ** 2;
              expectedDetail += (truth[i + 4] - truth[i]) ** 2;
            }
          result[kind + 'Error'] = Math.sqrt(error / signal);
          result[kind + 'Detail'] = detail / expectedDetail;
        }
        return result;
      });
      results.push({
        material: variant,
        preview,
        checkpoints,
        fidelity,
        error: renderer.getContext().getError(),
      });
    }
  } finally {
    resources.dispose();
    lighting.dispose();
    guides.dispose();
    reflected.dispose();
    output.dispose();
    quad.dispose();
    copy.dispose();
    block.geometry.dispose();
    wall.geometry.dispose();
    wood.dispose();
    chrome.dispose();
    maps.forEach((m) => m.dispose());
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return results;
}
