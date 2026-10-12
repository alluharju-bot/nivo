import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { History } from './history';
import { HistoryGraphWriter, readHistoryGraph } from './historyGraph';
import { freshProject, makeBody, parseProject, projectSchema, type Project } from './project';
import { shareProjectData } from './sharing';

function edit(project: Project, i: number): Project {
  return shareProjectData(
    project,
    projectSchema.parse({
      ...project,
      name: `Vaihe ${i}`,
      bodies: project.bodies.map((body, j) =>
        j === 0
          ? {
              ...body,
              name: `Osa ${i}`,
              origin: [i, body.origin[1], body.origin[2]],
            }
          : body,
      ),
    }),
  );
}

function checkLongHistory(start: Project) {
  const history = new History(start),
    before = history.retainedBytes;
  for (let i = 1; i <= 110; i++) {
    history.commit(edit(history.current, i), {
      label: `Siirto ${i}`,
      actionId: `move-${i}`,
      context: { ids: [start.bodies[0].id] },
    });
  }
  expect(history.undoCount).toBe(100);
  expect(history.memoryLimited).toBe(false);
  expect(history.retainedBytes - before).toBeLessThan(2_000_000);
  history.undo();
  history.undo();
  const time = performance.now(),
    serialized = history.serialize()!;
  const saveMs = performance.now() - time;
  expect(history.savedSteps).toBe(100);
  const restored = new History(parseProject(JSON.stringify(history.current)));
  const restoreStart = performance.now();
  expect(restored.restore(serialized)).toBe(true);
  const restoreMs = performance.now() - restoreStart;
  expect(restored.undoCount).toBe(98);
  expect(restored.redoCount).toBe(2);
  expect(restored.peekUndo()?.bodies[0].feature).toBe(restored.current.bodies[0].feature);
  restored.redo();
  restored.redo();
  for (let i = 109; i >= 10; i--) {
    expect(restored.undoInfo?.context?.ids).toEqual([start.bodies[0].id]);
    expect(restored.undo().name).toBe(`Vaihe ${i}`);
    expect(restored.current.bodies[0].origin[0]).toBe(i);
  }
  expect(restored.canUndo).toBe(false);
  for (let i = 11; i <= 110; i++) expect(restored.redo().name).toBe(`Vaihe ${i}`);
  const retained = restored.retainedBytes;
  restored.restoreBeforeAction('move-50');
  expect(restored.current.name).toBe('Vaihe 49');
  // Adoption after an actual transaction must not double-count unchanged data.
  restored.adopt(edit(restored.current, 49));
  expect(restored.retainedBytes).toBeLessThan(retained + 1000);
  restored.commit(edit(restored.current, 500));
  expect(restored.canRedo).toBe(false);
  expect(restored.retainedBytes).toBeLessThan(retained);
  return {
    steps: history.savedSteps,
    serializedBytes: new TextEncoder().encode(serialized).length,
    retainedBytes: history.retainedBytes,
    saveMs,
    restoreMs,
  };
}

it('keeps 100 edits of a large CAD model before and after reload without 100 BRep copies', () => {
  const body = makeBody();
  body.feature = {
    type: 'brep',
    width: 600,
    depth: 400,
    height: 18,
    solid: true,
    topologyId: 'large-cad',
    data: 'BREP regression payload '.repeat(290_000),
  };
  const result = checkLongHistory({ ...freshProject(), bodies: [body] });
  expect(result.serializedBytes).toBeLessThan(7_100_000);
});

it.skipIf(!process.env.NIVO_AUDIT_MODEL)(
  'retains 100 move/rename steps on the private project',
  () => {
    const project = parseProject(readFileSync(process.env.NIVO_AUDIT_MODEL!, 'utf8'));
    const oldSteps = Math.max(
      0,
      Math.floor((64 * 1024 * 1024) / (JSON.stringify(project).length * 2)) - 1,
    );
    console.log(JSON.stringify({ oldSteps, ...checkLongHistory(project) }));
  },
);

it('releases abandoned geometry and still bounds genuinely different large edits', () => {
  const start = freshProject(),
    history = new History(start, 90000);
  for (let i = 0; i < 12; i++)
    history.commit({
      ...start,
      assets: {
        image: {
          name: 'x',
          width: 1,
          height: 1,
          dataUrl: `data:image/png;base64,${String(i).repeat(8000)}`,
        },
      },
    });
  expect(history.memoryLimited).toBe(true);
  expect(history.undoCount).toBeGreaterThan(0);
  expect(history.undoCount).toBeLessThan(12);
  expect(history.retainedBytes).toBeLessThanOrEqual(90000);
  while (history.canUndo) history.undo();
  history.commit(start);
  expect(history.canRedo).toBe(false);
  history.restore();
  expect(history.retainedBytes).toBe(new History(start).retainedBytes);
});

it('restores v2 asset-pooled history and preserves different versions of an asset in v3', () => {
  const start = freshProject(),
    asset = { name: 'a', width: 1, height: 1, dataUrl: 'data:image/png;base64,AAAA' };
  const old = { ...start, name: 'Before', assets: ['image'] };
  const current = { ...start, assets: { image: asset } },
    history = new History(current);
  expect(
    history.restore(
      JSON.stringify({
        version: 2,
        assets: { image: asset },
        current: { ...current, assets: ['image'] },
        past: [old],
        future: [],
      }),
    ),
  ).toBe(true);
  expect(history.undo().name).toBe('Before');
  history.redo();
  history.commit({
    ...current,
    assets: { image: { ...asset, dataUrl: 'data:image/png;base64,BBBB' } },
  });
  const restored = new History(history.current);
  expect(restored.restore(history.serialize())).toBe(true);
  expect(restored.undo().assets?.image.dataUrl).toBe(asset.dataUrl);
  expect(restored.redo().assets?.image.dataUrl).toContain('BBBB');
});

it('rolls back rejected graph branches without leaving dangling references', () => {
  const writer = new HistoryGraphWriter(),
    shared = { name: 'shared' };
  const first = writer.encode({ shared }),
    checkpoint = writer.checkpoint;
  const rejected = { other: 'x'.repeat(1000), shared };
  writer.encode(rejected);
  writer.rollback(checkpoint);
  const next = writer.encode({ shared, rejected });
  const read = readHistoryGraph(JSON.parse(writer.json()));
  expect(read(first)).toEqual({ shared });
  expect(read(next)).toEqual({ shared, rejected });
});

it('keeps nearby undo and redo when an older state cannot fit the saved budget', () => {
  const start = freshProject(),
    history = new History({
      ...start,
      assets: {
        old: {
          name: 'old',
          width: 1,
          height: 1,
          dataUrl: 'data:image/png;base64,' + 'A'.repeat(50000),
        },
      },
    });
  for (const name of ['a', 'b', 'c', 'd']) history.commit({ ...start, name });
  history.undo();
  history.undo();
  const serialized = history.serialize(4000)!,
    restored = new History(history.current);
  expect(history.savedSteps).toBe(3);
  expect(restored.restore(serialized)).toBe(true);
  expect(restored.undo().name).toBe('a');
  expect(restored.canUndo).toBe(false);
  expect(restored.redo().name).toBe('b');
  expect(restored.redo().name).toBe('c');
  expect(restored.redo().name).toBe('d');
  expect(history.undoCount).toBe(2); // Storage trimming never mutates live history.
});

it('retains a hundred different geometric edits alongside a large unchanged part', () => {
  const large = makeBody(),
    edited = makeBody();
  large.feature = {
    type: 'brep',
    width: 600,
    depth: 400,
    height: 18,
    solid: true,
    topologyId: 'unchanged',
    data: 'B'.repeat(6_000_000),
  };
  const history = new History({ ...freshProject(), bodies: [large, edited] });
  for (let height = 1; height <= 100; height++)
    history.commit({
      ...history.current,
      bodies: [
        large,
        { ...edited, feature: { type: 'rectangle-extrusion', width: 600, depth: 400, height } },
      ],
    });
  const restored = new History(history.current);
  expect(restored.restore(history.serialize())).toBe(true);
  expect(restored.undoCount).toBe(100);
  for (let height = 99; height > 0; height--)
    expect(restored.undo().bodies[1].feature.height).toBe(height);
  expect(restored.undo().bodies[1]).toEqual(edited);
  expect(restored.current.bodies[0].feature).toBe(large.feature);
});

it('rejects cyclic, dangling and expansion-bomb histories without losing the active model', () => {
  const project = freshProject(),
    history = new History(project);
  const bomb: unknown[] = [[1, []]];
  for (let i = 1; i < 30; i++) bomb.push([1, [[i - 1], [i - 1]]]);
  for (const nodes of [[[0, { self: [0] }]], [[1, [[99]]]], bomb]) {
    expect(
      history.restore(JSON.stringify({ version: 3, nodes, current: [0], past: [], future: [] })),
    ).toBe(false);
    expect(history.current).toBe(project);
    expect(history.retainedBytes).toBe(new History(project).retainedBytes);
  }
});
