/** One bounded batch in flight. Timestamp spans distinguish ray work from
 * presentation without nested GPU queries; unsupported/disjoint timers report
 * CPU submission separately, never pretend it is GPU execution time. */
export function gpuQueue(gl: WebGL2RenderingContext) {
  type Kind = 'path' | 'presentation';
  let pending: WebGLSync | null = null;
  const timer = gl.getExtension?.('EXT_disjoint_timer_query_webgl2');
  const queries: { query: WebGLQuery; kind: Kind }[] = [];
  let active = false,
    batch = false,
    kind: Kind = 'path',
    spanStarted = 0;
  let started = 0,
    submitted = 1,
    tiles = 1,
    tileMs = 0,
    gpuMs = 0;
  const totals = {
    pathGpuMs: 0,
    presentationGpuMs: 0,
    pathCpuMs: 0,
    presentationCpuMs: 0,
    timedBatches: 0,
  };
  const beginSpan = (next: Kind) => {
    kind = next;
    spanStarted = performance.now();
    if (timer) {
      const query = gl.createQuery();
      if (query) {
        queries.push({ query, kind });
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        active = true;
      }
    }
  };
  const endSpan = () => {
    if (batch)
      totals[kind === 'path' ? 'pathCpuMs' : 'presentationCpuMs'] +=
        performance.now() - spanStarted;
    if (active) gl.endQuery(timer.TIME_ELAPSED_EXT);
    active = false;
  };
  const discardQueries = () => {
    for (const { query } of queries) gl.deleteQuery(query);
    queries.length = 0;
  };
  return {
    get tiles() {
      return tiles;
    },
    get milliseconds() {
      return gpuMs;
    },
    get timerAvailable() {
      return !!timer;
    },
    get timings() {
      return { ...totals };
    },
    begin() {
      started = performance.now();
      batch = true;
      beginSpan('path');
    },
    measure<T>(next: Kind, operation: () => T): T {
      if (!batch || next === kind) return operation();
      const previous = kind;
      endSpan();
      beginSpan(next);
      try {
        return operation();
      } finally {
        endSpan();
        beginSpan(previous);
      }
    },
    ready() {
      if (gl.isContextLost()) return false;
      if (!pending) return true;
      const state = gl.clientWaitSync(pending, 0, 0);
      if (state === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(pending);
      pending = null;
      if (state === gl.WAIT_FAILED) throw new Error('Näytönohjaimen renderöintijono keskeytyi.');
      gpuMs = Math.max(0.1, performance.now() - started);
      if (
        queries.length &&
        !gl.getParameter(timer.GPU_DISJOINT_EXT) &&
        queries.every(({ query }) => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))
      ) {
        gpuMs = 0;
        for (const { query, kind } of queries) {
          const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          totals[kind === 'path' ? 'pathGpuMs' : 'presentationGpuMs'] += ms;
          gpuMs += ms;
        }
        gpuMs = Math.max(0.1, gpuMs);
        totals.timedBatches++;
      }
      discardQueries();
      if (gpuMs < 250) {
        const measured = gpuMs / submitted;
        tileMs = tileMs ? tileMs * 0.65 + measured * 0.35 : measured;
        const desired = Math.max(1, Math.min(8, Math.ceil((timer ? 12 : 20) / tileMs)));
        tiles = Math.min(tiles + 1, desired);
      } else tiles = 1;
      return true;
    },
    submit(count = 1) {
      if (pending) throw new Error('Edellinen renderöintierä on vielä kesken.');
      submitted = Math.max(1, count);
      endSpan();
      batch = false;
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!pending)
        throw new Error('Renderöinnin synkronointi epäonnistui. Aloita tarkennus uudelleen.');
      gl.flush();
    },
    dispose() {
      endSpan();
      batch = false;
      if (pending) gl.deleteSync(pending);
      pending = null;
      discardQueries();
      tiles = 1;
      tileMs = 0;
    },
  };
}
