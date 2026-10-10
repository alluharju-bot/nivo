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

export class CadClient {
  private buildQueue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private meshKeys = new Map<string, string>();
  private meshes = new Map<string, BodyMesh>();
  private worker?: Worker;
  private counter = 0;
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
  private request<T>(request: CadRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(
        () => this.cancel('Laskennan aikaraja ylittyi. Edellinen malli säilyi.'),
        45_000,
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
      const delta = await this.request<BodyMesh[]>({ type: 'sync', updates, order });
      for (const mesh of delta) this.meshes.set(mesh.id, mesh);
      for (const id of this.meshes.keys()) if (!keys.has(id)) this.meshes.delete(id);
      this.meshKeys = keys;
    }
    return order.map((id) => this.meshes.get(id)!);
  }
  instances(source: Body, targets: Body[]) {
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
  rotate(bodies: Body[], pivot: Vec3, axis: Vec3, angle: number) {
    return this.request<Body[]>({ type: 'rotate', bodies, pivot, axis, angle });
  }
  pushPull(body: Body, face: FaceRef, distance: number) {
    return this.request<Body>({ type: 'push-pull', body, face, distance });
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
    return this.request<EdgeDetailResult>({
      type: 'edge-detail',
      body,
      indices,
      operation,
      size,
      editing,
    });
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
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    this.pending.clear();
  }
}
