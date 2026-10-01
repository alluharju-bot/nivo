import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, makeCompound, type AnyShape } from 'replicad';
import { createShape, meshBody, projectShapes, runProbe, pushPullFace } from './kernel';
import type { BodyMesh, CadRequest, CadReply } from './protocol';
import type { Body } from '../model/project';
import { booleanBodies, splitFace, offsetFace, offsetOutline } from './operations';
import { measureFaceSpan } from './measurement';
import { rotateBodies } from './transforms';

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
      else if (request.type === 'rotate')
        reply.result = rotateBodies(request.bodies, request.pivot, request.axis, request.angle);
      else if (request.type === 'face-span')
        reply.result = measureFaceSpan(request.body, request.face, request.point);
      else if (request.type === 'push-pull')
        reply.result = pushPullFace(request.body, request.face, request.distance);
      else if (request.type === 'boolean')
        reply.result = booleanBodies(request.targets, request.tools, request.operation);
      else if (request.type === 'split-face')
        reply.result = splitFace(request.body, request.face, request.profile, request.allowUnsplit);
      else if (request.type === 'offset-face')
        reply.result = offsetFace(request.body, request.face, request.distance);
      else if (request.type === 'offset-outline')
        reply.result = offsetOutline(request.body, request.face, request.distance);
      else {
        const entries = build(request.bodies);
        if (request.type === 'build') reply.result = entries.map((e) => e.mesh);
        else {
          const temporary: AnyShape[] = [];
          try {
            const shapes = entries.flatMap((entry, i) => {
              const purpose = request.bodies[i].purpose;
              if (purpose === 'construction') return [];
              if (purpose === 'drawing') {
                const outline = makeCompound(entry.shape.edges);
                temporary.push(outline);
                return [outline];
              }
              return [entry.shape];
            });
            reply.result = projectShapes(shapes, request.view);
          } finally {
            temporary.forEach((s) => s.delete());
          }
        }
      }
    } catch (error) {
      if (request.type !== 'offset-outline') console.error('CAD operation failed', error);
      reply.error =
        error instanceof Error
          ? error.message
          : 'CAD-laskenta epäonnistui. Edellinen ehjä malli säilyi.';
    }
    self.postMessage(reply);
  });
};
