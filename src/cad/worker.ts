import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, type AnyShape } from 'replicad';
import { createShape, meshBody, projectShapes, runProbe, pushPullFace } from './kernel';
import type { BodyMesh, CadRequest, CadReply } from './protocol';
import type { Body } from '../model/project';

const initialized = initOpenCascade({ locateFile: () => wasmUrl }).then(setOC);
type Entry = { key: string; shape: AnyShape; mesh: BodyMesh };
let cache = new Map<string, Entry>();

function build(bodies: Body[]): Entry[] {
  const next = new Map<string, Entry>();
  const allocated: AnyShape[] = [];
  try {
    for (const body of bodies) {
      const key = JSON.stringify([body.feature, body.origin]);
      const previous = cache.get(body.id);
      if (previous?.key === key) next.set(body.id, previous);
      else {
        const shape = createShape(body);
        allocated.push(shape);
        next.set(body.id, { key, shape, mesh: meshBody(body, shape) });
      }
    }
  } catch (error) {
    allocated.forEach((shape) => shape.delete());
    throw error;
  }
  for (const [id, entry] of cache) if (next.get(id) !== entry) entry.shape.delete();
  cache = next;
  return [...next.values()];
}

// A single kernel instance; explicitly serialize initialization and all operations.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<CadRequest & { id: number }>) => {
  const request = event.data;
  queue = queue.then(async () => {
    const reply: CadReply = { id: request.id };
    try {
      await initialized;
      if (request.type === 'probe') reply.result = runProbe();
      else if (request.type === 'push-pull')
        reply.result = pushPullFace(request.body, request.face, request.distance);
      else {
        const entries = build(request.bodies);
        reply.result =
          request.type === 'build'
            ? entries.map((e) => e.mesh)
            : projectShapes(
                entries.map((e) => e.shape),
                request.view,
              );
      }
    } catch (error) {
      console.error('CAD operation failed', error);
      reply.error =
        error instanceof Error
          ? error.message
          : 'CAD-laskenta epäonnistui. Edellinen ehjä malli säilyi.';
    }
    self.postMessage(reply);
  });
};
