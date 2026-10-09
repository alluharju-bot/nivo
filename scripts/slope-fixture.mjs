// Synthetic regression fixture only; never reads a user's project.
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  setOC(
    await init({
      wasmBinary: await readFile(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  );
  const { freshProject } = await server.ssrLoadModule('/src/model/project.ts');
  const { penPath } = await server.ssrLoadModule('/src/cad/paths.ts');
  const { throughShapes } = await server.ssrLoadModule('/src/cad/throughShapes.ts');
  const a = penPath(
    [
      [0, 0, 0],
      [1000, 0, 0],
    ],
    'A',
  );
  const b = penPath(
    [
      [0, 1000, -10],
      [1000, 1000, -10],
    ],
    'B',
  );
  const result = throughShapes([a, b], {
    mode: 'sections',
    smooth: true,
    closeSides: false,
    solid: false,
    reverseIds: [],
    name: 'Kaatopinta · 10 mm',
  });
  await writeFile(
    'tests/fixtures/sloped-surface.nivo',
    JSON.stringify({ ...freshProject(), bodies: [result.body] }),
  );
} finally {
  await server.close();
}
