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

export class CadClient {
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
        else job.resolve(event.data.result);
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
    return this.request<BodyMesh[]>({ type: 'build', bodies });
  }
  instances(source: Body, targets: Body[]) {
    return targets.length
      ? this.request<Body[]>({ type: 'instances', source, targets })
      : Promise.resolve([]);
  }
  project(bodies: Body[], view: DrawingView) {
    return this.request<Projection>({ type: 'project', bodies, view });
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
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    this.pending.clear();
  }
}
