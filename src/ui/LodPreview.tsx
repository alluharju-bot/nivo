import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer } from '../viewport/graphicsContext';

function disposeModel(model: GLTF) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  model.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  }
  textures.forEach((t) => {
    t.dispose();
    if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close();
  });
  geometries.forEach((g) => g.dispose());
}

/** One context and one camera for every level. Loaded from the actual downloadable GLB. */
export function LodPreview({ data, wireframe }: { data: Uint8Array; wireframe: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<
    | { show: (data: Uint8Array) => void; wire: (value: boolean) => void; fit: () => void }
    | undefined
  >(undefined);
  const initial = useRef({ data, wireframe });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createRenderer({ antialias: true });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.domElement.setAttribute('aria-label', 'LOD-mallin esikatselu');
    renderer.domElement.dataset.testid = 'lod-preview';
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8ede7');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10000);
    camera.position.set(1, 0.8, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.002;
    controls.maxPolarAngle = Math.PI - 0.002;
    scene.add(new THREE.HemisphereLight('#ffffff', '#8f9c90', 2.5));
    const sun = new THREE.DirectionalLight('#fff9ef', 3);
    sun.position.set(1, 3, 2);
    scene.add(sun);
    let model: GLTF | undefined,
      serial = 0,
      disposed = false,
      first = true,
      wireframe = initial.current.wireframe;
    const render = () => {
      if (!disposed) {
        renderer.domElement.dataset.camera = JSON.stringify([
          camera.position.toArray(),
          controls.target.toArray(),
          camera.zoom,
        ]);
        renderer.render(scene, camera);
      }
    };
    const fit = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model.scene);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3()),
        radius = Math.max(0.001, box.getSize(new THREE.Vector3()).length() / 2);
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance =
        (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) *
        Math.max(1, 1 / camera.aspect) *
        1.15;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = Math.max(0.00001, distance / 10000);
      camera.far = Math.max(100, distance * 100);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const wire = (value: boolean) => {
      wireframe = value;
      model?.scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            (m as THREE.MeshStandardMaterial).wireframe = value;
      });
      renderer.domElement.dataset.wireframe = String(value);
      render();
    };
    const show = (data: Uint8Array) => {
      const request = ++serial;
      setLoading(true);
      setError('');
      void import('three/addons/loaders/GLTFLoader.js')
        .then(({ GLTFLoader }) => new GLTFLoader().parseAsync(data.slice().buffer, ''))
        .then((next) => {
          if (disposed || request !== serial) {
            disposeModel(next);
            return;
          }
          if (model) {
            scene.remove(model.scene);
            disposeModel(model);
          }
          model = next;
          scene.add(next.scene);
          next.scene.updateMatrixWorld(true);
          let count = 0;
          next.scene.traverse((o) => {
            if (o instanceof THREE.Mesh)
              count +=
                ((o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3) *
                (o instanceof THREE.InstancedMesh ? o.count : 1);
          });
          renderer.domElement.dataset.triangles = String(count);
          wire(wireframe);
          if (first) {
            fit();
            first = false;
          }
          render();
          setLoading(false);
        })
        .catch((e) => {
          if (!disposed && request === serial) {
            setError(e.message);
            setLoading(false);
          }
        });
    };
    api.current = { show, wire, fit };
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    controls.addEventListener('change', render);
    const contextMenu = (e: Event) => e.preventDefault();
    const lost = (e: Event) => {
      e.preventDefault();
      setError('Esikatselun grafiikkayhteys katkesi. LOD-tiedostot voi silti ladata.');
    };
    renderer.domElement.addEventListener('contextmenu', contextMenu);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true;
      serial++;
      api.current = undefined;
      observer.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => api.current?.show(data), [data]);
  useEffect(() => api.current?.wire(wireframe), [wireframe]);
  return (
    <div className="lod-preview" ref={host}>
      <button className="lod-fit" onClick={() => api.current?.fit()}>
        Sovita malli
      </button>
      {loading && !error && (
        <span className="lod-preview-status" role="status">
          Avataan esikatselua…
        </span>
      )}
      {error && (
        <p className="lod-preview-status" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
