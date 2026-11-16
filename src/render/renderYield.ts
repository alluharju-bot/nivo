/** A bounded, cancellable task yield, independent of the screen refresh rate.
 * The GPU fence still permits only one batch in flight. A 4 ms task gives input
 * and painting a turn without forcing each 10–20 ms GPU batch to wait 16–33 ms. */
export function yieldRenderWork(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Renderöinti keskeytettiin.', 'AbortError'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Renderöinti keskeytettiin.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 4);
    signal.addEventListener('abort', abort, { once: true });
  });
}
