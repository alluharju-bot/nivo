import { scaleBodies } from './scaling';
import { sphereBody, bezierPath, knifeBodies } from './modeling';
import { throughShapes } from './throughShapes';
import { fillPenRegions } from './penRegions';
import { penPath, splitWithPath, cutOpening, divideSurfaces, faceProfile } from './paths';
import { CadBuildCache } from './buildCache';
import { sectionBodies } from './sections';
import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, makeCompound, type AnyShape } from 'replicad';
import { projectShapes, runProbe, pushPullFace } from './kernel';
import type { BodyMesh, CadRequest, CadReply } from './protocol';
import type { Body } from '../model/project';
import { bodyMeshKey } from './meshKey';
import {
  booleanBodies,
  splitFace,
  offsetFace,
  offsetOutline,
  removeBoundary,
  mergePlanarBodies,
} from './operations';
import { measureFaceSpan } from './measurement';
import { rotateBodies } from './transforms';
import { detailEdges, removeEdgeTreatment } from './details';
import { instantiateComponents } from './components';

const initialized = initOpenCascade({ locateFile: () => wasmUrl }).then(setOC);
const cache = new CadBuildCache();
let syncedBodies = new Map<string, Body>();
let sentMeshes = new Map<string, BodyMesh>();
// A preview already contains the final mesh. Accepting it must not tessellate it again.
let detailPreview: { key: string; mesh: BodyMesh } | undefined;
const build = (bodies: Body[]) => cache.build(bodies, detailPreview);

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
          const entry = cache.get(body);
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
      } else if (request.type === 'sphere')
        reply.result = sphereBody(request.center, request.radius, request.name);
      else if (request.type === 'bezier')
        reply.result = bezierPath(
          request.points,
          request.name,
          request.closed,
          request.mode,
          request.outline,
        );
      else if (request.type === 'through-shapes')
        reply.result = throughShapes(request.profiles, request.options);
      else if (request.type === 'knife')
        reply.result = knifeBodies(request.targets, request.rays, request.curveNormal);
      else if (request.type === 'pen-path') reply.result = penPath(request.points, request.name);
      else if (request.type === 'pen-regions')
        reply.result = fillPenRegions(request.path, request.boundaries, request.previous);
      else if (request.type === 'split-path')
        reply.result = splitWithPath(request.body, request.face, request.path);
      else if (request.type === 'cut-opening')
        reply.result = cutOpening(request.profile, request.targets, request.options);
      else if (request.type === 'face-profile')
        reply.result = faceProfile(request.body, request.face);
      else if (request.type === 'divide-surfaces')
        reply.result = divideSurfaces(request.profile, request.targets);
      else if (request.type === 'instances')
        reply.result = instantiateComponents(request.source, request.targets, cache);
      else if (request.type === 'scale')
        reply.result = await scaleBodies(request.bodies, request.pivot, request.factors, cache);
      else if (request.type === 'rotate')
        reply.result = rotateBodies(
          request.bodies,
          request.pivot,
          request.axis,
          request.angle,
          cache,
        );
      else if (request.type === 'face-span')
        reply.result = measureFaceSpan(request.body, request.face, request.point, cache);
      else if (request.type === 'push-pull')
        reply.result = pushPullFace(request.body, request.face, request.distance, cache);
      else if (request.type === 'boolean')
        reply.result = booleanBodies(request.targets, request.tools, request.operation);
      else if (request.type === 'merge-planar') reply.result = mergePlanarBodies(request.bodies);
      else if (request.type === 'split-face')
        reply.result = splitFace(
          request.body,
          request.face,
          request.profile,
          request.allowUnsplit,
          cache,
        );
      else if (request.type === 'offset-face')
        reply.result = offsetFace(request.body, request.face, request.distance, cache);
      else if (request.type === 'offset-outline')
        reply.result = offsetOutline(request.body, request.face, request.distance, cache);
      else if (request.type === 'remove-boundary')
        reply.result = removeBoundary(request.body, request.faces);
      else if (request.type === 'remove-detail') reply.result = removeEdgeTreatment(request.body);
      else if (request.type === 'edge-detail') {
        const result = detailEdges(
          request.body,
          request.indices,
          request.operation,
          request.size,
          request.editing,
          cache,
        );
        detailPreview = { key: bodyMeshKey(result.body), mesh: result.mesh };
        reply.result = result;
      } else {
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
      cache.clearPrepared();
      if (request.type !== 'offset-outline') console.error('CAD operation failed', error);
      reply.error =
        error instanceof Error
          ? error.message
          : 'CAD-laskenta epäonnistui. Edellinen ehjä malli säilyi.';
    }
    self.postMessage(reply);
  });
};
