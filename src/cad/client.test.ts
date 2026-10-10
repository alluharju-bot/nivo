import { afterEach, expect, it, vi } from 'vitest';
import { CadClient } from './client';
import { makeBody } from '../model/project';
import type { CadReply, CadRequest } from './protocol';

afterEach(() => vi.unstubAllGlobals());
it('accepts the latest exact edge preview once, shares pending work and retries failures/cancellation', async () => {
  const requests: (CadRequest & { id: number })[] = [];
  let worker: TestWorker;
  class TestWorker {
    onmessage?: (event: { data: CadReply }) => void;
    constructor() {
      worker = this;
    }
    terminate() {}
    postMessage(request: CadRequest & { id: number }) {
      requests.push(request);
    }
    reply(error?: string) {
      this.onmessage?.({ data: { id: requests.at(-1)!.id, error } });
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  const client = new CadClient(),
    body = makeBody();
  const first = client.edgeDetail(body, [2], 'fillet', 1);
  expect(client.edgeDetail(body, [2], 'fillet', 1)).toBe(first);
  worker!.reply();
  await first;
  expect(client.edgeDetail(body, [2], 'fillet', 1)).toBe(first);
  expect(requests).toHaveLength(1);
  const changed = client.edgeDetail(body, [2], 'fillet', 2);
  worker!.reply('Too large');
  await expect(changed).rejects.toThrow('Too large');
  const retry = client.edgeDetail(body, [2], 'fillet', 2);
  expect(requests).toHaveLength(3);
  worker!.reply();
  await retry;
  for (const [part, indices, operation, size, editing] of [
    [{ ...body, locked: true }, [2], 'fillet', 2, false],
    [body, [3], 'fillet', 2, false],
    [body, [3], 'chamfer', 2, false],
    [body, [3], 'chamfer', 2, true],
  ] as const) {
    const result = client.edgeDetail(part, [...indices], operation, size, editing);
    worker!.reply();
    await result;
  }
  expect(requests).toHaveLength(7);
  client.cancel();
  const after = client.edgeDetail(body, [3], 'chamfer', 2, true);
  expect(requests).toHaveLength(8);
  worker!.reply();
  await after;
  client.cancel();
});

it('sends only geometry deltas, preserves unchanged mesh identity, and resets after cancellation', async () => {
  const requests: CadRequest[] = [];
  class TestWorker {
    onmessage?: (event: { data: CadReply }) => void;
    terminate() {}
    postMessage(request: CadRequest & { id: number }) {
      requests.push(request);
      if (request.type !== 'sync') throw new Error('Expected delta sync');
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            id: request.id,
            meshDelta: request.updates.map((b) => ({ id: b.id, vertices: [...b.origin] }) as any),
          },
        }),
      );
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  const client = new CadClient();
  const a = makeBody(),
    b = makeBody(500, 300, 18, [1000, 0, 0]);
  const first = await client.build([a, b]);
  expect(requests).toHaveLength(1);
  const renamed = { ...a, name: 'Uusi nimi', color: '#aabbcc' };
  expect((await client.build([renamed, b]))[0]).toBe(first[0]);
  expect(requests).toHaveLength(1);
  const moved = { ...b, origin: [1100, 0, 0] as [number, number, number] };
  const next = await client.build([renamed, moved]);
  expect(requests[1]).toMatchObject({ type: 'sync', updates: [moved], order: [a.id, b.id] });
  expect(next[0]).toBe(first[0]);
  expect(next[1]).not.toBe(first[1]);
  expect(await client.build([renamed])).toEqual([first[0]]);
  expect(requests[2]).toMatchObject({ type: 'sync', updates: [], order: [a.id] });
  client.cancel();
  await client.build([renamed]);
  expect(requests[3]).toMatchObject({ updates: [renamed] });
  // A second build can arrive before the first worker reply. Its delta must be
  // computed against that reply, including geometry reverted by the second edit.
  const changed = { ...renamed, origin: [25, 0, 0] as [number, number, number] };
  const [intermediate, restored] = await Promise.all([
    client.build([changed]),
    client.build([renamed]),
  ]);
  expect(intermediate[0].vertices).toEqual([25, 0, 0]);
  expect(restored[0].vertices).toEqual([0, 0, 0]);
  expect(requests.at(-1)).toMatchObject({ updates: [renamed] });
  client.cancel();
});
