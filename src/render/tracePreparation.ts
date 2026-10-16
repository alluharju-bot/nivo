/** A missing network response or image decode must not leave Start pending forever.
 * The original promise stays handled if it settles after cancellation/timeout. */
export function prepareWithin<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (action: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      action();
    };
    const abort = () =>
      finish(() => reject(new DOMException('Renderöinti keskeytettiin.', 'AbortError')));
    timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              'Renderin materiaalien tai ympäristövalon lataus ei valmistunut. Tarkista yhteys ja käynnistä tarkennus uudelleen.',
            ),
          ),
        ),
      timeoutMs,
    );
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}

/** Count active waiting, not time spent in another tab, asleep or navigating.
 * A timer cannot interrupt a blocking driver call, but it can stop a driver
 * which keeps returning an unfinished compilation or GPU fence. */
export function traceWaitWatchdog() {
  let stage = '',
    elapsed = 0,
    previous = 0;
  return {
    reset() {
      stage = '';
      elapsed = 0;
      previous = 0;
    },
    check(next: 'compiling' | 'gpu', now = performance.now()) {
      elapsed = next === stage ? elapsed + Math.min(1_000, Math.max(0, now - previous)) : 0;
      stage = next;
      previous = now;
      const limit = next === 'compiling' ? 60_000 : 30_000;
      if (elapsed >= limit)
        throw new Error(
          next === 'compiling'
            ? 'Näytönohjaimen renderiohjelman valmistelu ei valmistunut. Tarkennus pysäytettiin. Voit jatkaa nopeassa esikatselussa ja yrittää uudelleen.'
            : 'Näytönohjain ei vastannut renderöintiin. Tarkennus pysäytettiin. Palaa malliin ennen uutta yritystä.',
        );
    },
  };
}
