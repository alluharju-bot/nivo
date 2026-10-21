import {
  AmbientLight,
  ArrowHelper,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Body, Vec3 } from '../model/project';
import { geometryOf, meshBounds, type SurfaceMesh } from '../surface/mesh';
import type { FractureResult, Obstacle, Pose } from './types';

export class FractureStage {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(42, 1, 0.1, 200000);
  private controls: OrbitControls;
  private objects = new Group();
  private context = new Group();
  private launchArrow = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 1, '#ffad55');
  private gravityArrow = new ArrowHelper(new Vector3(0, 0, -1), new Vector3(), 1, '#83c9ff');
  private region = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({
      color: '#ec9746',
      transparent: true,
      opacity: 0.25,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  private grid: GridHelper;
  private resize: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private source?: Mesh;
  private pieces: Mesh[] = [];
  private down?: [number, number];
  constructor(
    private canvas: HTMLCanvasElement,
    private body: Body,
    private mesh: SurfaceMesh,
    private pick: (normal: Vec3, point: Vec3, sourceHit: boolean) => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene.background = new Color('#202a35');
    this.camera.up.set(0, 0, 1);
    const box = meshBounds(mesh),
      span = Math.max(...box.size, 100);
    this.camera.near = Math.max(0.1, span / 10000);
    this.camera.far = Math.max(200000, span * 20);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = span * 0.01;
    this.controls.maxDistance = span * 30;
    this.scene.add(new AmbientLight('#d8e6ff', 2));
    const sun = new DirectionalLight('#ffffff', 3);
    sun.position.set(span, -span, span * 2);
    this.scene.add(sun);
    this.grid = new GridHelper(span * 6, 30, '#546778', '#354756');
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.set(box.center[0], box.center[1], -body.origin[2]);
    this.scene.add(
      this.grid,
      this.context,
      this.objects,
      this.region,
      this.launchArrow,
      this.gravityArrow,
    );
    for (const arrow of [this.launchArrow, this.gravityArrow]) {
      arrow.visible = false;
      for (const object of [arrow.line, arrow.cone]) {
        object.renderOrder = 10;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => {
          m.depthTest = false;
          m.depthWrite = false;
        });
      }
    }
    this.region.visible = false;
    this.resetCamera();
    this.show(undefined, '#a49c8e');
    this.resize = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(canvas);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    const render = () => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(render);
    };
    render();
  }
  private pointerDown = (event: PointerEvent) => {
    this.down = event.button === 0 ? [event.clientX, event.clientY] : undefined;
  };
  private pointerUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = undefined;
    if (
      event.button !== 0 ||
      !down ||
      Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4
    )
      return;
    const rect = this.canvas.getBoundingClientRect(),
      ray = new Raycaster();
    ray.setFromCamera(
      new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const hit = ray.intersectObjects(
      [...this.objects.children, ...this.context.children],
      false,
    )[0];
    if (hit?.face)
      this.pick(
        hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(),
        hit.point.toArray(),
        hit.object === this.source,
      );
  };
  resetCamera() {
    const box = new Box3().setFromObject(this.objects);
    const original = meshBounds(this.mesh);
    box.expandByPoint(new Vector3(...original.min));
    box.expandByPoint(new Vector3(...original.max));
    const center = box.isEmpty() ? new Vector3(...original.center) : box.getCenter(new Vector3());
    const span = Math.max(
      ...original.size,
      box.isEmpty() ? 0 : box.getSize(new Vector3()).length(),
      100,
    );
    this.camera.position.copy(center).add(new Vector3(span * 1.2, -span * 1.6, span));
    this.controls.target.copy(center);
    this.controls.update();
  }
  private clear(group: Group) {
    group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        mats.forEach((m) => m.dispose());
      }
    });
    group.clear();
  }
  show(result: FractureResult | undefined, interior: string) {
    this.clear(this.objects);
    this.pieces = [];
    this.source = undefined;
    if (!result) {
      this.source = new Mesh(
        geometryOf(this.mesh),
        new MeshStandardMaterial({ color: this.body.color, roughness: 0.85, side: DoubleSide }),
      );
      this.objects.add(this.source);
      return;
    }
    result.fragments.forEach((fragment) => {
      const g = geometryOf(fragment.mesh),
        center = meshBounds(fragment.mesh).center;
      g.translate(-center[0], -center[1], -center[2]);
      const faces = [...new Set(fragment.mesh.faces)];
      const materials = faces.map(
        (face) =>
          new MeshStandardMaterial({
            name: face === result.interiorFace ? 'fracture-interior' : 'exterior',
            color:
              face === result.interiorFace
                ? interior
                : (this.body.faceMaterials?.[face]?.color ?? this.body.color),
            roughness: 0.85,
          }),
      );
      let start = 0;
      for (let t = 1; t <= fragment.mesh.faces.length; t++) {
        if (
          t === fragment.mesh.faces.length ||
          fragment.mesh.faces[t] !== fragment.mesh.faces[start]
        ) {
          g.addGroup(start * 3, (t - start) * 3, faces.indexOf(fragment.mesh.faces[start]));
          start = t;
        }
      }
      const object = new Mesh(g, materials);
      object.position.set(...center);
      this.objects.add(object);
      this.pieces.push(object);
    });
  }
  setInterior(color: string) {
    for (const piece of this.pieces) {
      const materials = Array.isArray(piece.material) ? piece.material : [piece.material];
      for (const material of materials)
        if (material instanceof MeshStandardMaterial && material.name === 'fracture-interior')
          material.color.set(color);
    }
  }
  setPoses(poses: Pose[], result: FractureResult, keepLoose: boolean, spread: number) {
    const center = new Vector3(...meshBounds(this.mesh).center);
    poses.forEach((pose, i) => {
      const object = this.pieces[i];
      if (!object) return;
      object.position.set(...pose.position);
      object.quaternion.set(...pose.rotation);
      if (spread && !result.fragments[i].fixed)
        object.position.add(
          new Vector3(...meshBounds(result.fragments[i].mesh).center)
            .sub(center)
            .multiplyScalar(spread),
        );
      object.visible = keepLoose || result.fragments[i].fixed;
    });
  }
  setRegion(region?: { normal: Vec3; offset: number }) {
    this.region.visible = !!region;
    if (!region) return;
    const box = meshBounds(this.mesh),
      normal = new Vector3(...region.normal);
    const center = new Vector3(...box.center);
    center.addScaledVector(normal, region.offset - normal.dot(center));
    this.region.position.copy(center);
    this.region.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
    this.region.scale.setScalar(Math.max(...box.size) * 1.4);
  }
  setGround(z?: number) {
    this.grid.visible = z !== undefined;
    if (z !== undefined) this.grid.position.z = z;
  }
  setDirections(launch?: Vec3, gravity?: Vec3) {
    const box = meshBounds(this.mesh),
      span = Math.max(...box.size, 100);
    const center = new Vector3(...box.center);
    for (const [arrow, direction] of [
      [this.launchArrow, launch],
      [this.gravityArrow, gravity],
    ] as const) {
      arrow.visible = !!direction && Math.hypot(...direction) > 0.001;
      if (!direction || !arrow.visible) continue;
      arrow.position.copy(center);
      arrow.setDirection(new Vector3(...direction).normalize());
      arrow.setLength(span * 0.7, span * 0.12, span * 0.07);
    }
  }
  setObstacles(obstacles: Obstacle[]) {
    this.clear(this.context);
    for (const obstacle of obstacles) {
      const geometry = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute(obstacle.vertices, 3),
      );
      geometry.setIndex(obstacle.triangles);
      geometry.computeVertexNormals();
      this.context.add(
        new Mesh(
          geometry,
          new MeshStandardMaterial({
            color: '#738796',
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: DoubleSide,
          }),
        ),
      );
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.clear(this.objects);
    this.clear(this.context);
    this.region.geometry.dispose();
    this.region.material.dispose();
    this.launchArrow.dispose();
    this.gravityArrow.dispose();
    this.grid.geometry.dispose();
    (Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]).forEach((m) =>
      m.dispose(),
    );
    this.renderer.dispose();
    // React StrictMode reuses a connected canvas during its setup/cleanup probe.
    // Release the GPU context only after a real unmount has detached that canvas.
    queueMicrotask(() => {
      if (!this.canvas.isConnected) this.renderer.forceContextLoss();
    });
  }
}
