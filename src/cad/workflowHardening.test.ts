import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, freshProject, parseProject, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { asComponent, synchronizeComponents } from '../model/components';
import { defaultAppearance } from '../model/materials';
import { paintSurface } from '../model/faceMaterials';
import { History } from '../model/history';
import { createShape, meshBody, pushPullFace, shapeIsValid } from './kernel';
import { offsetFace } from './operations';
import { cutOpening } from './paths';
import { detailEdges } from './details';
import { shapeEdges } from './topology';
import { instantiateComponents } from './components';
import { CadBuildCache } from './buildCache';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

it('keeps a draw/offset/hollow/cut/fillet/paint/link/edit/undo/save chain valid', async () => {
  const cache = new CadBuildCache();
  const start = makeBody(180, 120, 0);
  try {
    const [flat] = cache.build([start]);
    const block = pushPullFace(start, flat.mesh.faces[0].ref, 60, cache);
    const [blockMesh] = cache.build([block]);
    const top = blockMesh.mesh.faces.find((f) => f.normal[2] > 0.99 && f.center[2] > 59)!;
    const inset = offsetFace(block, top.ref, 3, cache);
    cache.build([inset.body]);
    const hollow = pushPullFace(inset.body, inset.face, -56, cache);
    cache.build([hollow]);
    const circle = makeProfileBody(
      { kind: 'circle', radius: 10 },
      sketchFrame([90, 0, 30], [0, -1, 0]),
    );
    const cut = cutOpening(circle, [hollow]).bodies[0];
    expect(cut).toBeDefined();
    const shape = createShape(cut),
      edges = shapeEdges(shape);
    let corner = -1;
    try {
      corner = edges.findIndex((e) => {
        const a = e.startPoint,
          b = e.endPoint;
        try {
          return (
            Math.abs(a.x) < 1e-5 &&
            Math.abs(b.x) < 1e-5 &&
            Math.abs(a.y) < 1e-5 &&
            Math.abs(b.y) < 1e-5 &&
            Math.abs(a.z - b.z) > 59
          );
        } finally {
          a.delete();
          b.delete();
        }
      });
    } finally {
      edges.forEach((e) => e.delete());
      shape.delete();
    }
    expect(corner).toBeGreaterThanOrEqual(0);
    const rounded = detailEdges(cut, [corner], 'fillet', 1).body;
    cache.build([rounded]);
    const painted = asComponent(paintSurface(rounded, defaultAppearance('walnut'), '#704020'));
    const sibling: Body = {
      ...painted,
      id: 'sibling',
      origin: [300, ...painted.origin.slice(1)] as [number, number, number],
    };
    const initial = { ...freshProject(), bodies: [painted, sibling] },
      history = new History(initial);
    const changed = paintSurface(painted, defaultAppearance('oak'), '#bd9a62');
    const synced = await synchronizeComponents(
      initial,
      { ...initial, bodies: [changed, sibling] },
      async (s, t) => instantiateComponents(s, t, cache),
    );
    history.commit(synced, { label: 'Materiaali', context: { ids: [painted.id] } });
    expect(synced.bodies.every((b) => b.color === '#bd9a62')).toBe(true);
    expect(history.undo()).toEqual(initial);
    expect(history.redo()).toEqual(synced);
    const reopened = parseProject(JSON.stringify(synced));
    const restored = new History(reopened);
    expect(restored.restore(history.serialize())).toBe(true);
    expect(restored.undo().bodies).toEqual(parseProject(JSON.stringify(initial)).bodies);
    for (const b of reopened.bodies) {
      const shape = createShape(b);
      try {
        expect(shapeIsValid(shape)).toBe(true);
        expect(meshBody(b, shape).volume).toBeGreaterThan(0);
      } finally {
        shape.delete();
      }
    }
  } finally {
    cache.dispose();
  }
}, 30000);
