import { afterEach, expect, it, vi } from 'vitest';
import { CadClient } from './client';
import { makeBody } from '../model/project';
import type { CadReply, CadRequest } from './protocol';

afterEach(() => vi.unstubAllGlobals());
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
