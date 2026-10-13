import { expect, it, vi } from 'vitest';
import { gpuQueue } from './gpuQueue';

it('does not queue another batch while the GPU is busy, and waits without blocking input', () => {
  const sync = {};
  const gl = {
    isContextLost: () => false,
    fenceSync: vi.fn(() => sync),
    flush: vi.fn(),
    deleteSync: vi.fn(),
    clientWaitSync: vi.fn(() => 1),
    TIMEOUT_EXPIRED: 1,
    WAIT_FAILED: 2,
    SYNC_GPU_COMMANDS_COMPLETE: 3,
  };
  const queue = gpuQueue(gl as unknown as WebGL2RenderingContext);
  expect(queue.ready()).toBe(true);
  queue.submit();
  expect(() => queue.submit()).toThrow('Edellinen renderöintierä');
  expect(queue.ready()).toBe(false);
  expect(gl.clientWaitSync).toHaveBeenCalledWith(sync, 0, 0);
  expect(gl.deleteSync).not.toHaveBeenCalled();
  gl.clientWaitSync.mockReturnValue(4);
  expect(queue.ready()).toBe(true);
  expect(gl.deleteSync).toHaveBeenCalledTimes(1);
  queue.submit();
  queue.dispose();
  queue.dispose();
  expect(gl.deleteSync).toHaveBeenCalledTimes(2);
});

it('stops if the driver cannot allocate a fence instead of silently losing the queue bound', () => {
  const gl = {
    fenceSync: () => null,
    SYNC_GPU_COMMANDS_COMPLETE: 3,
    flush: vi.fn(),
  };
  const queue = gpuQueue(gl as unknown as WebGL2RenderingContext);
  expect(() => queue.submit()).toThrow('synkronointi epäonnistui');
  expect(gl.flush).not.toHaveBeenCalled();
});

it('sizes batches from completed GPU time and releases timestamp queries', () => {
  const extension = { TIME_ELAPSED_EXT: 5, GPU_DISJOINT_EXT: 6 };
  const gl = {
    getExtension: () => extension,
    isContextLost: () => false,
    createQuery: () => ({}),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    deleteQuery: vi.fn(),
    getParameter: () => false,
    getQueryParameter: vi.fn((_: unknown, p: number): boolean | number => (p === 7 ? true : 1e6)),
    fenceSync: () => ({}),
    flush: vi.fn(),
    deleteSync: vi.fn(),
    clientWaitSync: () => 4,
    TIMEOUT_EXPIRED: 1,
    WAIT_FAILED: 2,
    SYNC_GPU_COMMANDS_COMPLETE: 3,
    QUERY_RESULT_AVAILABLE: 7,
    QUERY_RESULT: 8,
  };
  const queue = gpuQueue(gl as unknown as WebGL2RenderingContext);
  for (let i = 0; i < 5; i++) {
    queue.begin();
    queue.submit(queue.tiles);
    expect(queue.ready()).toBe(true);
  }
  expect(queue.tiles).toBeGreaterThan(1);
  expect(queue.milliseconds).toBe(1);
  gl.getQueryParameter.mockImplementation((_, p) => (p === 7 ? true : 180e6));
  queue.begin();
  queue.submit(1);
  queue.ready();
  expect(queue.tiles).toBe(1);
  queue.begin();
  queue.dispose();
  expect(gl.endQuery).toHaveBeenCalledTimes(7);
  expect(gl.deleteQuery).toHaveBeenCalledTimes(7);
});
