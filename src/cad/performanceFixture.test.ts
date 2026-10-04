import { test, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, drawCircle, makeBox, type Sketch } from 'replicad';
import { makeBody, freshProject } from '../model/project';
import { bodyFromShape } from './kernel';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

test('mixed cabinet benchmark combines exact rounded doors, drilled backs and separate panels', () => {
  const doorBox = makeBox([0, 0, 0], [600, 18, 2350]),
    rounded = doorBox.fillet(2);
  const backBox = makeBox([0, 0, 0], [600, 18, 2400]),
    hole = (drawCircle(40).sketchOnPlane('XZ') as Sketch).extrude(40).translate([300, 30, 150]);
  const drilled = backBox.cut(hole);
  try {
    const templates = [
      makeBody(18, 600, 2400, [0, 0, 0], 'Vasen sivu'),
      makeBody(18, 600, 2400, [582, 0, 0], 'Oikea sivu'),
      makeBody(564, 600, 18, [18, 0, 2382], 'Katto'),
      makeBody(564, 600, 18, [18, 0, 0], 'Pohja'),
      makeBody(564, 564, 18, [18, 0, 1200], 'Hylly'),
      {
        ...bodyFromShape(makeBody(), rounded),
        origin: [0, -20, 25] as [number, number, number],
        name: 'Pyöristetty ovi',
      },
      {
        ...bodyFromShape(makeBody(), drilled),
        origin: [0, 582, 0] as [number, number, number],
        name: 'Tausta läpiviennillä',
      },
    ];
    expect(templates[5].feature.type).toBe('brep');
    expect(templates[6].feature.type).toBe('brep');
    if (process.env.NIVO_PERF_FIXTURE) {
      const count = Number(process.env.NIVO_PERF_PARTS ?? 1184),
        columns = Math.ceil(Math.sqrt(count / 7));
      const bodies = Array.from({ length: count }, (_, i) => {
        const body = templates[i % 7],
          cabinet = Math.floor(i / 7);
        return {
          ...body,
          id: `perf-${i}`,
          groupId: 'benchmark',
          origin: body.origin.map(
            (n, axis) =>
              n +
              (axis === 0
                ? (cabinet % columns) * 800
                : axis === 1
                  ? Math.floor(cabinet / columns) * 900
                  : 0),
          ),
        };
      });
      writeFileSync(
        process.env.NIVO_PERF_FIXTURE,
        JSON.stringify({
          ...freshProject(),
          name: `Kalustetyömaa · ${count} osaa`,
          bodies,
          groups: [{ id: 'benchmark', name: 'Työmaa', hidden: false }],
        }),
      );
    }
  } finally {
    drilled.delete();
    hole.delete();
    backBox.delete();
    rounded.delete();
    doorBox.delete();
  }
});
