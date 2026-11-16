import { afterEach, expect, it, vi } from 'vitest';
import { yieldRenderWork } from './renderYield';

afterEach(() => vi.useRealTimers());
it('resumes GPU work without a display animation frame', async () => {
  vi.useFakeTimers();
  const done = vi.fn();
  const work = yieldRenderWork(new AbortController().signal).then(done);
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4);
  await work;
  expect(done).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels pending work and does not leave a timer or late continuation', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const done = vi.fn();
  const result = yieldRenderWork(controller.signal)
    .then(done)
    .catch((e) => e.name);
  controller.abort();
  expect(await result).toBe('AbortError');
  await vi.runAllTimersAsync();
  expect(done).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await expect(yieldRenderWork(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
});
