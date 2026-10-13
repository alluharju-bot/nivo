/** At most one small trace batch in flight. Yield to input instead of building
 * an unbounded GPU queue. Never use finish() or a blocking clientWaitSync. */
export function gpuQueue(gl: WebGL2RenderingContext) {
  let pending: WebGLSync | null = null;
  const timer = gl.getExtension?.('EXT_disjoint_timer_query_webgl2');
  let query: WebGLQuery | null = null;
  let queryActive = false;
  let started = 0,
    submitted = 1,
    tiles = 1,
    tileMs = 0,
    gpuMs = 0;
  const discardQuery = () => {
    if (query) gl.deleteQuery(query);
    query = null;
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
    begin() {
      started = performance.now();
      if (timer && !query) {
        query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          queryActive = true;
        }
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
      // Timestamp queries measure GPU execution; the fence fallback measures a
      // conservative completion bound, including time until the next RAF poll.
      gpuMs = Math.max(0.1, performance.now() - started);
      if (
        query &&
        !gl.getParameter(timer.GPU_DISJOINT_EXT) &&
        gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
      )
        gpuMs = Math.max(0.1, gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      discardQuery();
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
      if (queryActive) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        queryActive = false;
      }
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!pending)
        throw new Error('Renderöinnin synkronointi epäonnistui. Aloita tarkennus uudelleen.');
      gl.flush();
    },
    dispose() {
      if (queryActive) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        queryActive = false;
      }
      if (pending) gl.deleteSync(pending);
      pending = null;
      discardQuery();
      tiles = 1;
      tileMs = 0;
    },
  };
}
