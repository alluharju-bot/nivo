// Opt-in local benchmark. Never copies model geometry into results or fixtures.
import { beforeAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { parseProject } from '../model/project';
import { CadBuildCache } from './buildCache';
import { rotateBodies } from './transforms';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
it.skipIf(!process.env.NIVO_UNDO_MODEL)(
  'measures cold vs retained undo/redo on the largest local BRep',
  () => {
    const project = parseProject(readFileSync(process.env.NIVO_UNDO_MODEL!, 'utf8'));
    const body = project.bodies
      .filter((b) => b.feature.type === 'brep')
      .sort(
        (a, b) =>
          (b.feature.type === 'brep' ? b.feature.data.length : 0) -
          (a.feature.type === 'brep' ? a.feature.data.length : 0),
      )[0];
    expect(body).toBeDefined();
    const result: Record<string, unknown> = {};
    for (const [name, budget] of [
      ['withoutRetention', 0],
      ['retained', 64 * 1024 * 1024],
    ] as const) {
      const cache = new CadBuildCache(budget);
      try {
        const [original] = cache.build([{ ...body, locked: false }]);
        const [rotated] = rotateBodies(
          [{ ...body, locked: false }],
          [0, 0, 0],
          [0, 0, 1],
          30,
          cache,
        );
        cache.build([rotated]);
        const start = performance.now();
        cache.build([body]);
        const undoMs = performance.now() - start;
        const redoStart = performance.now();
        cache.build([rotated]);
        const redoMs = performance.now() - redoStart;
        result[name] = {
          undoMs,
          redoMs,
          faces: original.mesh.faces.length,
          edgeSegments: original.mesh.edges.length / 6,
          ...cache.historySize,
        };
      } finally {
        cache.dispose();
      }
    }
    if (process.env.NIVO_UNDO_RESULT)
      writeFileSync(process.env.NIVO_UNDO_RESULT, JSON.stringify(result, null, 2));
  },
  180000,
);
