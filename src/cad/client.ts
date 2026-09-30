import type {
  CadReply,
  CadRequest,
  BodyMesh,
  Projection,
  ProbeResult,
  DrawingView,
} from './protocol';
import type { Body } from '../model/project';

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
  project(bodies: Body[], view: DrawingView) {
    return this.request<Projection>({ type: 'project', bodies, view });
  }
  probe() {
    return this.request<ProbeResult>({ type: 'probe' });
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
