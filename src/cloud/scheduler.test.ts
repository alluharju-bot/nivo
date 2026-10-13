import { afterEach, expect, it, vi } from 'vitest';
import { SyncScheduler } from './scheduler';

afterEach(() => vi.useRealTimers());

it('waits for eight quiet seconds; focus and online checks cannot upload during an edit burst', async () => {
  vi.useFakeTimers();
  const action = vi.fn(async () => {}),
    scheduler = new SyncScheduler(action);
  for (let i = 0; i < 5; i++) {
    scheduler.changed();
    await vi.advanceTimersByTimeAsync(4000);
    scheduler.check();
  }
  expect(action).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3999);
  expect(action).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(action).toHaveBeenCalledTimes(1);
  scheduler.dispose();
});

it('manual sync is immediate and consumes the pending automatic request', async () => {
  vi.useFakeTimers();
  const action = vi.fn(async () => {}),
    scheduler = new SyncScheduler(action);
  scheduler.changed();
  await scheduler.now();
  expect(action).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(8000);
  expect(action).toHaveBeenCalledTimes(1);
  scheduler.check();
  await vi.advanceTimersByTimeAsync(0);
  expect(action).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});

it('coalesces slow uploads and uploads the latest edit once after the in-flight snapshot', async () => {
  vi.useFakeTimers();
  const sent: number[] = [];
  let version = 1,
    release!: () => void;
  const scheduler = new SyncScheduler(async () => {
    sent.push(version);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(8000);
  for (version = 2; version <= 8; version++) {
    scheduler.changed();
    scheduler.check();
    await vi.advanceTimersByTimeAsync(2000);
  }
  expect(sent).toEqual([1]);
  release();
  await vi.advanceTimersByTimeAsync(8000);
  expect(sent).toEqual([1, 9]);
  release();
  await vi.advanceTimersByTimeAsync(8000);
  expect(sent).toEqual([1, 9]);
  scheduler.dispose();
});

it('leaves a hidden tab pending and cancels stale project/account work on disposal', async () => {
  vi.useFakeTimers();
  let visible = false;
  const action = vi.fn(async () => {}),
    scheduler = new SyncScheduler(action, () => visible);
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(9000);
  expect(action).not.toHaveBeenCalled();
  visible = true;
  scheduler.check();
  await vi.advanceTimersByTimeAsync(0);
  expect(action).toHaveBeenCalledTimes(1);
  scheduler.changed();
  scheduler.dispose();
  await vi.advanceTimersByTimeAsync(10000);
  expect(action).toHaveBeenCalledTimes(1);
  scheduler.activate(); // React development StrictMode remounts effects.
  scheduler.changed();
  await vi.advanceTimersByTimeAsync(8000);
  expect(action).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});
