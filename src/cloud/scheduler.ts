export const AUTO_SYNC_DELAY = 8000;

/** One automatic request after editing settles. Polling/focus/online events
 * cannot bypass that quiet period or build an upload queue on a slow network. */
export class SyncScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private lastEdit = -Infinity;
  private lastStart = -Infinity;
  private pending = false;
  private running?: Promise<void>;
  private stopped = false;

  constructor(
    private action: () => Promise<void>,
    private visible: () => boolean = () => true,
  ) {}

  activate() {
    this.stopped = false;
  }

  changed() {
    this.lastEdit = Date.now();
    this.check();
  }

  check() {
    if (this.stopped) return;
    this.pending = true;
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.stopped || this.running || !this.pending) return;
    const wait = Math.max(
      0,
      this.lastEdit + AUTO_SYNC_DELAY - Date.now(),
      this.lastStart + AUTO_SYNC_DELAY - Date.now(),
    );
    this.timer = setTimeout(() => {
      if (this.visible()) void this.now();
    }, wait);
  }

  now(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.pending = false;
    this.lastStart = Date.now();
    this.running = Promise.resolve()
      .then(this.action)
      .finally(() => {
        this.running = undefined;
        this.schedule();
      });
    return this.running;
  }

  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
