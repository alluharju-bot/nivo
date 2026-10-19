// Synthetic mechanical animation example. No user projects or cloud data are read.
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { freshProject, makeBody, projectSchema } =
    await server.ssrLoadModule('/src/model/project.ts');
  const { ensureAnimationNodes, putKey } = await server.ssrLoadModule('/src/model/animation.ts');
  const project = {
    ...freshProject(),
    id: 'nivo-blast-door-demo',
    name: 'Blast Door · mekaaninen animaatio',
    updatedAt: '2026-10-19T00:00:00.000Z',
  };
  project.groups = [
    { id: 'root', name: 'BLAST_DOOR_ROOT', kind: 'folder', hidden: false },
    { id: 'left', name: 'LEFT_DOOR_GROUP', kind: 'assembly', parentId: 'root', hidden: false },
    { id: 'right', name: 'RIGHT_DOOR_GROUP', kind: 'assembly', parentId: 'root', hidden: false },
    {
      id: 'left-pins',
      name: 'LEFT_LOCKING_PINS',
      kind: 'assembly',
      parentId: 'left',
      hidden: false,
    },
    {
      id: 'right-pins',
      name: 'RIGHT_LOCKING_PINS',
      kind: 'assembly',
      parentId: 'right',
      hidden: false,
    },
  ];
  const body = (id, size, origin, groupId, color) => ({
    ...makeBody(...size, origin, id),
    id,
    groupId,
    color,
  });
  project.bodies = [
    body('FRAME_LEFT', [100, 180, 2200], [-800, 0, 0], 'root', '#465b60'),
    body('FRAME_RIGHT', [100, 180, 2200], [700, 0, 0], 'root', '#465b60'),
    body('FRAME_TOP', [1400, 180, 100], [-700, 0, 2100], 'root', '#465b60'),
    body('LEFT_DOOR_MESH', [698, 80, 2100], [-700, 0, 0], 'left', '#738a8e'),
    body('RIGHT_DOOR_MESH', [698, 80, 2100], [2, 0, 0], 'right', '#738a8e'),
    body('LEFT_PANEL', [540, 20, 1300], [-620, -20, 400], 'left', '#96a8a5'),
    body('RIGHT_PANEL', [540, 20, 1300], [80, -20, 400], 'right', '#96a8a5'),
    body('LEFT_LOCK_TOP', [32, 34, 100], [-80, -34, 1700], 'left-pins', '#c4a66a'),
    body('LEFT_LOCK_BOTTOM', [32, 34, 100], [-80, -34, 300], 'left-pins', '#c4a66a'),
    body('RIGHT_LOCK_TOP', [32, 34, 100], [48, -34, 1700], 'right-pins', '#c4a66a'),
    body('RIGHT_LOCK_BOTTOM', [32, 34, 100], [48, -34, 300], 'right-pins', '#c4a66a'),
    body('HYDRAULIC_PISTON_LEFT', [180, 32, 32], [-800, -42, 1980], 'root', '#b5c3c6'),
    body('HYDRAULIC_PISTON_RIGHT', [180, 32, 32], [620, -42, 1980], 'root', '#b5c3c6'),
  ];
  let data = ensureAnimationNodes(project);
  const ids = new Map(data.nodes.map((n) => [n.id, `node-${n.bodyId ?? n.groupId}`]));
  data.nodes = data.nodes.map((n) => ({ ...n, id: ids.get(n.id), parentId: ids.get(n.parentId) }));
  let clip = {
    id: 'blast-door-open',
    name: 'BLAST_DOOR_OPEN',
    duration: 3.5,
    loop: false,
    tracks: [],
    markers: [
      { id: 'pressure', name: 'HYDRAULIC_PRESSURE_START', time: 0 },
      { id: 'unlock', name: 'LOCK_RELEASE_IMPACT', time: 0.35 },
      { id: 'strain', name: 'METAL_STRAIN', time: 0.8 },
      { id: 'steam', name: 'STEAM_RELEASE', time: 1.7 },
      { id: 'open', name: 'DOOR_OPEN_COMPLETE', time: 3.5 },
    ],
  };
  function track(target, samples) {
    const node = data.nodes.find((n) => n.groupId === target || n.bodyId === target);
    for (const [i, [time, offset, scale = [1, 1, 1]]] of samples.entries())
      clip = putKey(clip, node.id, {
        id: `${target}-${i}`,
        time,
        pose: { ...node.rest, position: node.rest.position.map((v, a) => v + offset[a]), scale },
        interpolation: 'smooth',
      });
  }
  track('left', [
    [0, [0, 0, 0]],
    [0.35, [0, -5, 0]],
    [0.8, [0, -8, 0]],
    [1.7, [0, -100, 0]],
    [3.5, [-700, -100, 0]],
  ]);
  track('right', [
    [0, [0, 0, 0]],
    [0.4, [0, -5, 0]],
    [0.85, [0, -8, 0]],
    [1.75, [0, -100, 0]],
    [3.5, [700, -100, 0]],
  ]);
  track('left-pins', [
    [0, [0, 0, 0]],
    [0.35, [0, 0, -35]],
  ]);
  track('right-pins', [
    [0, [0, 0, 0]],
    [0.4, [0, 0, -35]],
  ]);
  track('HYDRAULIC_PISTON_LEFT', [
    [0, [0, 0, 0]],
    [1.7, [0, -100, 0]],
    [3.5, [-350, -100, 0], [4.9, 1, 1]],
  ]);
  track('HYDRAULIC_PISTON_RIGHT', [
    [0, [0, 0, 0]],
    [1.75, [0, -100, 0]],
    [3.5, [350, -100, 0], [4.9, 1, 1]],
  ]);
  project.animation = { ...data, clips: [clip] };
  await writeFile(
    'public/examples/blast-door.nivo',
    JSON.stringify(projectSchema.parse(project), null, 2) + '\n',
  );
  console.log('Created public/examples/blast-door.nivo: 13 parts, 6 tracks, 3.5 seconds.');
} finally {
  await server.close();
}
