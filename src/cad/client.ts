import type { Section } from '../model/sections';
import type { SectionResult } from './protocol';
import type {
  CadReply,
  CadRequest,
  BodyMesh,
  Projection,
  ProbeResult,
  DrawingView,
  SplitResult,
  FaceSpan,
  EdgeDetailResult,
} from './protocol';
import type { Body, FaceRef, Vec3 } from '../model/project';
import { bodyMeshKey } from './meshKey';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { around, meshBody as importedMeshBody, transformMesh } from '../exchange/mesh';
import { translateMesh } from './translateMesh';
import { requireMovable } from '../model/transforms';

export class CadClient {
  private buildQueue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private meshKeys = new Map<string, string>();
  private meshes = new Map<string, BodyMesh>();
  private nativeTemplates = new WeakMap<Body['feature'], BodyMesh>();
  private worker?: Worker;
  private counter = 0;
  private detailPreview?: { body: Body; key: string; result: Promise<EdgeDetailResult> };
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private getWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<CadReply>) => {
        const job = this.pending.get(event.data.id);
        if (!job) return;
        clearTimeout(job.timer);
        this.pending.delete(event.data.id);
        if (event.data.error) job.reject(new Error(event.data.error));
        else job.resolve(event.data.meshDelta ?? event.data.result);
      };
      this.worker.onerror = () =>
        this.cancel('CAD-ydin ei käynnistynyt. Yritä toimintoa uudelleen.');
    }
    return this.worker;
  }
  private request<T>(request: CadRequest, timeout = 45_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(
        () => this.cancel('Laskennan aikaraja ylittyi. Edellinen malli säilyi.'),
        timeout,
      );
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.getWorker().postMessage({ ...request, id });
    });
  }
  build(bodies: Body[]) {
    const generation = this.generation;
    const next = this.buildQueue
      .catch(() => {})
      .then(() => {
        if (generation !== this.generation) throw new Error('Laskenta peruttiin.');
        return this.syncBuild(bodies);
      });
    this.buildQueue = next;
    return next;
  }
  private async syncBuild(bodies: Body[]) {
    const keys = new Map(bodies.map((body) => [body.id, bodyMeshKey(body)]));
    const updates = bodies.filter((body) => this.meshKeys.get(body.id) !== keys.get(body.id));
    const order = bodies.map((body) => body.id);
    const removed = [...this.meshKeys.keys()].some((id) => !keys.has(id));
    if (updates.length || removed) {
      const delta = await this.request<BodyMesh[]>({
        type: 'sync',
        updates: updates.filter((b) => b.feature.type !== 'mesh'),
        order: bodies.filter((b) => b.feature.type !== 'mesh').map((b) => b.id),
      });
      for (const mesh of delta) this.meshes.set(mesh.id, mesh);
      for (const body of updates.filter((b) => b.feature.type === 'mesh')) {
        let template = this.nativeTemplates.get(body.feature);
        if (!template) {
          template = importedMeshBody({ ...body, origin: [0, 0, 0] });
          this.nativeTemplates.set(body.feature, template);
        }
        this.meshes.set(body.id, translateMesh(template, body.id, body.origin));
      }
      for (const id of this.meshes.keys()) if (!keys.has(id)) this.meshes.delete(id);
      this.meshKeys = keys;
    }
    return order.map((id) => this.meshes.get(id)!);
  }
  instances(source: Body, targets: Body[]) {
    if (source.feature.type === 'mesh' && source.component) {
      const from = new Matrix4()
        .compose(
          new Vector3(...source.origin).add(new Vector3(...source.component.offset)),
          new Quaternion(...source.component.rotation),
          new Vector3(1, 1, 1),
        )
        .invert();
      return Promise.resolve(
        targets.map((target) => {
          if (!target.component) throw new Error('Komponenttilinkki puuttuu.');
          const matrix = new Matrix4()
            .compose(
              new Vector3(...target.origin).add(new Vector3(...target.component.offset)),
              new Quaternion(...target.component.rotation),
              new Vector3(1, 1, 1),
            )
            .multiply(from);
          const transformed = transformMesh(source, matrix);
          return {
            ...target,
            feature: transformed.feature,
            origin: transformed.origin,
            component: { ...target.component, offset: transformed.component!.offset },
            quantityBasis: transformed.quantityBasis,
          };
        }),
      );
    }
    return targets.length
      ? this.request<Body[]>({ type: 'instances', source, targets })
      : Promise.resolve([]);
  }
  project(bodies: Body[], view: DrawingView) {
    return this.request<Projection>({ type: 'project', bodies, view });
  }
  section(bodies: Body[], section: Section, drawing = false) {
    return this.request<SectionResult>({ type: 'section', bodies, section, drawing });
  }
  probe() {
    return this.request<ProbeResult>({ type: 'probe' });
  }
  importStep(data: ArrayBuffer, name: string) {
    return this.request<Body[]>({ type: 'import-step', data, name }, 120_000);
  }
  exportStep(bodies: Body[]) {
    return this.request<Blob>({ type: 'export-step', bodies }, 120_000);
  }
  async releaseProjectHistory() {
    this.detailPreview = undefined;
    this.nativeTemplates = new WeakMap();
    if (this.worker) await this.request<void>({ type: 'release-history' });
  }
  printMeshes(bodies: Body[], tolerance: number) {
    return this.request<import('../exchange/export').ExportMesh[]>(
      { type: 'print-meshes', bodies, tolerance },
      120_000,
    );
  }
  async scale(bodies: Body[], pivot: Vec3, factors: Vec3) {
    requireMovable(bodies);
    if (factors.some((n) => !Number.isFinite(n) || n <= 0))
      throw new Error('Skaalauskertoimen tulee olla positiivinen.');
    const cad = bodies.filter((b) => b.feature.type !== 'mesh');
    const result = cad.length
      ? await this.request<Body[]>({ type: 'scale', bodies: cad, pivot, factors }, 120_000)
      : [];
    const changed = new Map(result.map((b) => [b.id, b]));
    return bodies.map(
      (b) =>
        changed.get(b.id) ?? transformMesh(b, around(pivot, new Matrix4().makeScale(...factors))),
    );
  }
  async rotate(bodies: Body[], pivot: Vec3, axis: Vec3, angle: number) {
    requireMovable(bodies);
    if (!Number.isFinite(angle) || Math.hypot(...axis) < 1e-9)
      throw new Error('Tarkista kiertokulma ja akseli.');
    const cad = bodies.filter((b) => b.feature.type !== 'mesh');
    const result = cad.length
      ? await this.request<Body[]>({ type: 'rotate', bodies: cad, pivot, axis, angle })
      : [];
    const changed = new Map(result.map((b) => [b.id, b]));
    const matrix = around(
      pivot,
      new Matrix4().makeRotationAxis(new Vector3(...axis).normalize(), (angle * Math.PI) / 180),
    );
    return bodies.map((b) => changed.get(b.id) ?? transformMesh(b, matrix));
  }
  pushPull(body: Body, face: FaceRef, distance: number) {
    return this.request<Body>({ type: 'push-pull', body, face, distance });
  }
  removeFaces(body: Body, faces: FaceRef[]) {
    return this.request<Body[]>({ type: 'remove-faces', body, faces });
  }
  faceSpan(body: Body, face: FaceRef, point?: Vec3) {
    return this.request<FaceSpan>({ type: 'face-span', body, face, point });
  }
  boolean(targets: Body[], tools: Body[], operation: 'cut' | 'join') {
    return this.request<Body[]>({ type: 'boolean', targets, tools, operation });
  }
  mergePlanar(bodies: Body[]) {
    return this.request<Body>({ type: 'merge-planar', bodies });
  }
  sphere(center: Vec3, radius: number, name: string) {
    return this.request<Body>({ type: 'sphere', center, radius, name });
  }
  bezier(
    points: Vec3[],
    name: string,
    closed = false,
    mode: 'smooth' | 'bezier' = 'bezier',
    outline = false,
  ) {
    return this.request<Body>({ type: 'bezier', points, name, closed, mode, outline });
  }
  throughShapes(profiles: Body[], options: import('./throughShapes').ThroughShapesOptions) {
    return this.request<EdgeDetailResult>({ type: 'through-shapes', profiles, options });
  }
  surfaceLevels(
    profiles: Body[],
    options: import('../model/surfaceLevels').SurfaceLevelOptions,
    existing?: Body,
  ) {
    return this.request<import('./surfaceLevels').SurfaceLevelsResult>({
      type: 'surface-levels',
      profiles,
      options,
      existing,
    });
  }
  knife(targets: Body[], rays: import('./modeling').KnifeRay[], curveNormal?: Vec3) {
    return this.request<import('./modeling').KnifeResult>({
      type: 'knife',
      targets,
      rays,
      curveNormal,
    });
  }
  penPath(points: Vec3[], name: string) {
    return this.request<Body>({ type: 'pen-path', points, name });
  }
  penRegions(path: Body, boundaries: Body[], previous: Body[] = []) {
    return this.request<import('./penRegions').PenRegions>({
      type: 'pen-regions',
      path,
      boundaries,
      previous,
    });
  }
  splitPath(body: Body, face: FaceRef, path: Body) {
    return this.request<SplitResult>({ type: 'split-path', body, face, path });
  }
  addSurfaceRegions(body: Body, regions: Body[], normal?: Vec3) {
    return this.request<SplitResult | undefined>({
      type: 'add-surface-regions',
      body,
      regions,
      normal,
    });
  }
  divideSurfaces(profile: Body, targets: Body[]) {
    return this.request<SplitResult[]>({ type: 'divide-surfaces', profile, targets });
  }
  cutOpening(
    profile: Body,
    targets: Body[],
    options?: import('../model/openingPattern').OpeningPattern,
  ) {
    return this.request<import('./paths').OpeningResult>({
      type: 'cut-opening',
      profile,
      targets,
      options,
    });
  }
  faceProfile(body: Body, face: FaceRef) {
    return this.request<Body>({ type: 'face-profile', body, face });
  }
  split(body: Body, face: FaceRef, profile: Body, allowUnsplit = false) {
    return this.request<SplitResult>({ type: 'split-face', body, face, profile, allowUnsplit });
  }
  offset(body: Body, face: FaceRef, distance: number) {
    return this.request<SplitResult>({ type: 'offset-face', body, face, distance });
  }
  offsetOutline(body: Body, face: FaceRef, distance: number) {
    return this.request<number[]>({ type: 'offset-outline', body, face, distance });
  }
  removeBoundary(body: Body, faces: [FaceRef, FaceRef]) {
    return this.request<Body>({ type: 'remove-boundary', body, faces });
  }
  edgeDetail(
    body: Body,
    indices: number[],
    operation: 'fillet' | 'chamfer',
    size: number,
    editing = false,
  ) {
    const key = JSON.stringify([indices, operation, size, editing]);
    if (this.detailPreview?.body === body && this.detailPreview.key === key)
      return this.detailPreview.result;
    const result = this.request<EdgeDetailResult>({
      type: 'edge-detail',
      body,
      indices,
      operation,
      size,
      editing,
    });
    const preview = { body, key, result };
    this.detailPreview = preview;
    // A rejected/cancelled calculation must remain retryable. Keep only the latest result.
    void result.catch(() => {
      if (this.detailPreview === preview) this.detailPreview = undefined;
    });
    return result;
  }
  removeDetail(body: Body) {
    return this.request<Body>({ type: 'remove-detail', body });
  }
  cancel(message = 'Laskenta peruttiin.') {
    this.generation++;
    this.worker?.terminate();
    this.worker = undefined;
    this.meshKeys.clear();
    this.meshes.clear();
    this.detailPreview = undefined;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    this.pending.clear();
  }
}
