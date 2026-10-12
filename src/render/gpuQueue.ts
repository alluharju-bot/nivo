/** At most one small trace batch in flight. Yield to input instead of building
 * an unbounded GPU queue. Never use finish() or a blocking clientWaitSync. */
export function gpuQueue(gl: WebGL2RenderingContext) {
  let pending: WebGLSync | null = null;
  return {
    ready() {
      if (gl.isContextLost()) return false;
      if (!pending) return true;
      const state = gl.clientWaitSync(pending, 0, 0);
      if (state === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(pending);
      pending = null;
      if (state === gl.WAIT_FAILED) throw new Error('Näytönohjaimen renderöintijono keskeytyi.');
      return true;
    },
    submit() {
      if (pending) throw new Error('Edellinen renderöintierä on vielä kesken.');
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!pending)
        throw new Error('Renderöinnin synkronointi epäonnistui. Aloita tarkennus uudelleen.');
      gl.flush();
    },
    dispose() {
      if (pending) gl.deleteSync(pending);
      pending = null;
    },
  };
}
