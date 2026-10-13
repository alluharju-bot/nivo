import type { SnapshotRequest } from './prepareSnapshot';

/** Cache only the last immutable editor snapshot. A different saved string
 * (including another tab's write) always triggers verification again. */
export class CloudSnapshot {
  private cached?: SnapshotRequest & { hash: Promise<string> };
  private worker?: Worker;
  private counter = 0;
  private pending = new Map<
    number,
    {
      resolve: (hash: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  prepare(request: SnapshotRequest): Promise<string> {
    const previous = this.cached;
    if (
      previous?.project === request.project &&
      previous.remoteId === request.remoteId &&
      previous.saved === request.saved
    )
      return previous.hash;
    const hash = this.calculate(request);
    this.cached = { ...request, hash };
    void hash.catch(() => {
      if (this.cached?.hash === hash) this.cached = undefined;
    });
    return hash;
  }

  private calculate(request: SnapshotRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL('./snapshot.worker.ts', import.meta.url), {
            type: 'module',
          });
          this.worker.onmessage = (
            event: MessageEvent<{ id: number; hash: string; error?: string }>,
          ) => {
            const job = this.pending.get(event.data.id);
            if (!job) return;
            clearTimeout(job.timer);
            this.pending.delete(event.data.id);
            if (event.data.error) job.reject(new Error(event.data.error));
            else job.resolve(event.data.hash);
          };
          this.worker.onerror = this.worker.onmessageerror = () => this.dispose();
        }
        const id = ++this.counter;
        const timer = setTimeout(() => this.dispose(), 60_000);
        this.pending.set(id, { resolve, reject, timer });
        this.worker.postMessage({ ...request, id });
      } catch (error) {
        this.dispose();
        reject(error);
      }
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
    this.cached = undefined;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(
        new Error(
          'Pilvitarkistus keskeytyi. Paikallinen malli säilyy; yritä synkronointia uudelleen.',
        ),
      );
    }
    this.pending.clear();
  }
}
