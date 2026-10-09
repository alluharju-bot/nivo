// Generate a public, synthetic example. Never reads an existing user's project.
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
  const { freshProject, makeProfileBody } = await server.ssrLoadModule('/src/model/project.ts');
  const { sketchFrame } = await server.ssrLoadModule('/src/model/sketch.ts');
  const { bezierPath } = await server.ssrLoadModule('/src/cad/modeling.ts');
  const { throughShapes } = await server.ssrLoadModule('/src/cad/throughShapes.ts');
  const options = {
    mode: 'sides',
    smooth: true,
    closeSides: true,
    solid: false,
    reverseIds: [],
    name: 'Pullo · neljä sivukäyrää',
  };
  const sides = [0, 1, 2, 3].map((i) => {
    const angle = (i * Math.PI) / 2;
    const points = [
      [55, 0],
      [60, 70],
      [49, 155],
      [52, 190],
      [22, 235],
      [22, 265],
    ].map(([r, z]) => [r * Math.cos(angle), r * Math.sin(angle), z]);
    return {
      ...bezierPath(points, `Pullon sivukäyrä ${i + 1}`, false, 'smooth'),
      purpose: 'construction',
      groupId: 'bottle-profiles',
      hidden: true,
    };
  });
  const rings = [
    makeProfileBody(
      { kind: 'circle', radius: 55 },
      sketchFrame([0, 0, 0]),
      0,
      'Asettelu · ala',
      'construction',
    ),
    makeProfileBody(
      { kind: 'circle', radius: 52 },
      sketchFrame([0, 0, 190]),
      0,
      'Asettelu · olkapää',
      'construction',
    ),
  ].map((b) => ({ ...b, groupId: 'bottle-profiles', hidden: true }));
  const bottle = { ...throughShapes(sides, options).body, color: '#729ba2' };
  const sections = [
    [65, 0],
    [60, 70],
    [30, 150],
    [23, 200],
  ].map(([radius, z], i) => ({
    ...makeProfileBody(
      { kind: 'circle', radius },
      sketchFrame([190, 0, z]),
      0,
      `Poikkileikkaus ${i + 1}`,
      'construction',
    ),
    groupId: 'sections',
    hidden: true,
  }));
  const vase = {
    ...throughShapes(sections, {
      ...options,
      mode: 'sections',
      name: 'Pinta · neljä poikkileikkausta',
    }).body,
    color: '#c9a17d',
  };
  const coneBase = {
    ...makeProfileBody(
      { kind: 'circle', radius: 55 },
      sketchFrame([370, 0, 0]),
      0,
      'Kartion profiili',
      'construction',
    ),
    hidden: true,
  };
  const cone = {
    ...throughShapes([coneBase], {
      ...options,
      mode: 'sections',
      solid: true,
      tipHeight: 170,
      name: 'Kartio · ympyrästä kärkeen',
    }).body,
    color: '#a5ae82',
  };
  const project = {
    ...freshProject(),
    name: 'Muotojen läpi · esimerkki',
    bodies: [...rings, ...sides, bottle, ...sections, vase, coneBase, cone],
    groups: [
      { id: 'bottle-profiles', name: 'Pullon lähtömuodot' },
      { id: 'sections', name: 'Poikkileikkaukset' },
    ],
  };
  await writeFile('public/examples/muotojen-lapi.nivo', JSON.stringify(project));
  console.log(
    `Generated ${project.bodies.length} synthetic bodies in public/examples/muotojen-lapi.nivo`,
  );
} finally {
  await server.close();
}
