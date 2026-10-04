import { penPath, splitWithPath, cutOpening, divideSurfaces } from './paths';
import { translateMesh } from './translateMesh';
import { sectionBodies } from './sections';
import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, makeCompound, type AnyShape } from 'replicad';
import { createShape, meshBody, projectShapes, runProbe, pushPullFace } from './kernel';
import type { BodyMesh, CadRequest, CadReply } from './protocol';
import type { Body, Vec3 } from '../model/project';
import { bodyMeshKey } from './meshKey';
import { booleanBodies, splitFace, offsetFace, offsetOutline, removeBoundary } from './operations';
import { measureFaceSpan } from './measurement';
import { rotateBodies } from './transforms';
import { detailEdges, removeEdgeTreatment } from './details';
import { instantiateComponents } from './components';

const initialized = initOpenCascade({ locateFile: () => wasmUrl }).then(setOC);
type Entry = { key: string; shape: AnyShape; mesh: BodyMesh };
let cache = new Map<string, Entry>();
let syncedBodies = new Map<string, Body>();
let sentMeshes = new Map<string, BodyMesh>();

function build(bodies: Body[]): Entry[] {
  const next = new Map<string, Entry>();
  const allocated: AnyShape[] = [];
  const templates = new Map<string, { entry: Entry; origin: Vec3 }>();
  try {
    for (const body of bodies) {
      const key = bodyMeshKey(body);
      const previous = cache.get(body.id);
      const templateKey = JSON.stringify([body.feature, body.edgeTreatment]);
      if (previous?.key === key) next.set(body.id, previous);
      else {
        const template = templates.get(templateKey);
        const delta = template
          ? (body.origin.map((n, i) => n - template.origin[i]) as Vec3)
          : undefined;
        const shape = template ? template.entry.shape.clone().translate(delta!) : createShape(body);
        allocated.push(shape);
        next.set(body.id, {
          key,
          shape,
          mesh: template
            ? translateMesh(template.entry.mesh, body.id, delta!)
            : meshBody(body, shape),
        });
      }
      if (!templates.has(templateKey))
        templates.set(templateKey, { entry: next.get(body.id)!, origin: body.origin });
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
      else if (request.type === 'section')
        reply.result = sectionBodies(request.bodies, request.section, request.drawing, (body) => {
          const entry = cache.get(body.id);
          return entry?.key === bodyMeshKey(body) ? entry.shape : undefined;
        });
      else if (request.type === 'sync') {
        const updates = new Map(request.updates.map((body) => [body.id, body]));
        const ordered = request.order.map((id) => {
          const body = updates.get(id) ?? syncedBodies.get(id);
          if (!body) throw new Error('CAD-välimuistin osa puuttuu. Yritä toimintoa uudelleen.');
          return body;
        });
        const entries = build(ordered);
        reply.meshDelta = entries
          .filter((entry) => sentMeshes.get(entry.mesh.id) !== entry.mesh)
          .map((entry) => entry.mesh);
        syncedBodies = new Map(ordered.map((body) => [body.id, body]));
        sentMeshes = new Map(entries.map((entry) => [entry.mesh.id, entry.mesh]));
      } else if (request.type === 'pen-path') reply.result = penPath(request.points, request.name);
      else if (request.type === 'split-path')
        reply.result = splitWithPath(request.body, request.face, request.path);
      else if (request.type === 'cut-opening')
        reply.result = cutOpening(request.profile, request.targets);
      else if (request.type === 'divide-surfaces')
        reply.result = divideSurfaces(request.profile, request.targets);
      else if (request.type === 'instances')
        reply.result = instantiateComponents(request.source, request.targets);
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
      else if (request.type === 'remove-boundary')
        reply.result = removeBoundary(request.body, request.faces);
      else if (request.type === 'remove-detail') reply.result = removeEdgeTreatment(request.body);
      else if (request.type === 'edge-detail')
        reply.result = detailEdges(
          request.body,
          request.indices,
          request.operation,
          request.size,
          request.editing,
        );
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
