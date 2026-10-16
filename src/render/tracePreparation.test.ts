import { afterEach, expect, it, vi } from 'vitest';
import { prepareWithin, traceWaitWatchdog } from './tracePreparation';

afterEach(() => vi.useRealTimers());

it('bounds an unresolved asset and handles its late rejection', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const work = new Promise<void>((_, no) => {
    reject = no;
  });
  const result = prepareWithin(work, new AbortController().signal);
  const failed = expect(result).rejects.toThrow('lataus ei valmistunut');
  await vi.advanceTimersByTimeAsync(30_000);
  await failed;
  reject(new Error('late network error'));
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels a pending preparation immediately and permits an independent retry', async () => {
  vi.useFakeTimers();
  const stop = new AbortController();
  const pending = prepareWithin(new Promise(() => {}), stop.signal);
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  stop.abort();
  await cancelled;
  expect(vi.getTimerCount()).toBe(0);
  await expect(prepareWithin(Promise.resolve(42), new AbortController().signal)).resolves.toBe(42);
  expect(vi.getTimerCount()).toBe(0);
});

it('propagates the actual asset error and handles an already cancelled start', async () => {
  const controller = new AbortController();
  await expect(
    prepareWithin(Promise.reject(new Error('decode')), controller.signal),
  ).rejects.toThrow('decode');
  controller.abort();
  await expect(prepareWithin(Promise.resolve(1), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('stops an unresponsive shader or GPU, but not normal batches or a suspended tab', () => {
  for (const [stage, seconds, message] of [
    ['gpu', 30, 'ei vastannut'],
    ['compiling', 60, 'valmistelu ei valmistunut'],
  ] as const) {
    const watch = traceWaitWatchdog();
    for (let t = 0; t < seconds; t++) watch.check(stage, t * 1000);
    expect(() => watch.check(stage, seconds * 1000)).toThrow(message);
    watch.reset();
    watch.check(stage, 100_000);
    // A long gap between frames must not count as minutes of active waiting.
    watch.check(stage, 800_000);
    watch.reset();
    for (let t = 0; t < 100; t++) {
      watch.check(stage, t * 1000);
      watch.reset();
    }
  }
});
