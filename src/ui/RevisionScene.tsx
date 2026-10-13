import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BodyMesh } from '../cad/protocol';
import { changeColors, type ChangeKind } from '../model/revisions';

export type RevisionMesh = { mesh: BodyMesh; id: string; kind?: ChangeKind; ghost?: boolean };
export function RevisionScene({
  items,
  selected,
  focus,
  onSelect,
}: {
  items: RevisionMesh[];
  selected?: string;
  focus: number;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (id?: string, fit?: boolean) => void } | undefined>(undefined);
  const latest = useRef({ onSelect, selected });
  latest.current = { onSelect, selected };
  const [error, setError] = useState('');
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError('Vertailun 3D-näkymä ei käynnistynyt. Muutosluettelo on käytettävissä.');
      return;
    }
    setError('');
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    el.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Projektiversioiden vertailu');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf1ee');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1e7);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.zoomToCursor = true;
    controls.maxPolarAngle = Math.PI - 0.002;
    controls.minPolarAngle = 0.002;
    scene.add(new THREE.HemisphereLight('#ffffff', '#9aa8a1', 2.6));
    const sun = new THREE.DirectionalLight('#fffaf0', 2);
    sun.position.set(1, -2, 4);
    scene.add(sun);
    const objects: THREE.Mesh[] = [];
    const owned: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (const item of items) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.mesh.vertices, 3));
      geometry.setIndex(item.mesh.triangles);
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(item.mesh.normals, 3));
      geometry.computeBoundingBox();
      owned.push(geometry);
      const material = new THREE.MeshStandardMaterial({
        color: item.kind ? changeColors[item.kind] : '#aebbb3',
        roughness: 1,
        metalness: 0,
        transparent: !!item.ghost,
        opacity: item.ghost ? 0.24 : 1,
        depthWrite: !item.ghost,
        side: THREE.DoubleSide,
      });
      materials.push(material);
      const object = new THREE.Mesh(geometry, material);
      object.userData = { id: item.id, kind: item.kind, ghost: item.ghost };
      scene.add(object);
      objects.push(object);
      if (item.ghost && item.mesh.edges.length < 180000) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(item.mesh.edges, 3));
        owned.push(g);
        const m = new THREE.LineBasicMaterial({
          color: item.kind ? changeColors[item.kind] : '#cc6677',
          transparent: true,
          opacity: 0.5,
          depthTest: false,
        });
        materials.push(m);
        const lines = new THREE.LineSegments(g, m);
        scene.add(lines);
      }
    }
    const render = () => renderer.render(scene, camera);
    const fit = (id?: string) => {
      const box = new THREE.Box3();
      objects.filter((o) => !id || o.userData.id === id).forEach((o) => box.expandByObject(o));
      if (box.isEmpty())
        box.set(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
      const center = box.getCenter(new THREE.Vector3()),
        radius = Math.max(20, box.getSize(new THREE.Vector3()).length() / 2);
      let direction = camera.position.clone().sub(controls.target).normalize();
      if (direction.lengthSq() < 0.5) direction.set(1, -1, 0.8).normalize();
      const distance =
        (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) *
        Math.max(1, 1 / camera.aspect) *
        1.15;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = Math.max(0.1, distance / 10000);
      camera.far = Math.max(1e5, distance * 100);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const select = (id?: string, zoom = false) => {
      for (const object of objects) {
        const m = object.material as THREE.MeshStandardMaterial;
        m.emissive.set(object.userData.id === id ? '#59492d' : '#000000');
        m.emissiveIntensity = 0.35;
      }
      if (zoom) fit(id);
      else render();
    };
    api.current = { select };
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
    camera.position.set(1, -1, 0.8);
    fit();
    select(latest.current.selected);
    controls.addEventListener('change', render);
    let press: [number, number] | undefined;
    const down = (e: PointerEvent) => {
      if (e.button === 0) press = [e.clientX, e.clientY];
    };
    const up = (e: PointerEvent) => {
      if (!press || Math.hypot(e.clientX - press[0], e.clientY - press[1]) > 5) {
        press = undefined;
        return;
      }
      press = undefined;
      const r = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(objects, false)[0];
      if (hit) latest.current.onSelect(hit.object.userData.id);
    };
    const context = (e: Event) => e.preventDefault();
    const lost = (e: Event) => {
      e.preventDefault();
      setError('3D-yhteys katkesi. Sulje vertailu ja avaa se uudelleen.');
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('contextmenu', context);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      api.current = undefined;
      observer.disconnect();
      controls.dispose();
      owned.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [items]);
  useEffect(() => {
    api.current?.select(selected);
  }, [selected]);
  useEffect(() => {
    api.current?.select(selected, true);
  }, [focus]);
  return (
    <div className="revision-scene" ref={host}>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
