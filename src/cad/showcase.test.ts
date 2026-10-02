import { beforeAll, expect, it } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import {
  cabinetProject,
  makeBody,
  makeProfileBody,
  parseProject,
  type PointDimension,
} from '../model/project';
import { defaultAppearance, findPreset } from '../model/materials';
import { detailEdges } from './details';
import { createShape, meshBody } from './kernel';
import { referenceAnchor } from '../model/guides';
import { addBodyDimensions } from '../model/dimensions';
import { sketchFrame } from '../model/sketch';

beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);
function inlayPNG() {
  const crc = (bytes: Uint8Array) => {
    let n = 0xffffffff;
    for (const b of bytes) {
      n ^= b;
      for (let j = 0; j < 8; j++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type),
      len = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, sum]);
  };
  const width = 64,
    height = 128,
    header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor((x + y / 2) / 12) % 2 === 0,
        color = stripe ? [49, 83, 78] : [194, 161, 110],
        index = y * (width * 3 + 1) + 1 + x * 3;
      color.forEach((v, i) => (pixels[index + i] = v));
    }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
it('builds the complete rounded, dimensioned and textured cabinet example', () => {
  let project = cabinetProject();
  project.name = 'Nivo · viimeistelty tammikaappi';
  project.groups = [
    { id: 'cabinet', name: 'Tammikaappi', hidden: false },
    { id: 'frame', name: 'Runko', parentId: 'cabinet', hidden: false },
    { id: 'doors', name: 'Ovet', parentId: 'cabinet', hidden: false },
    { id: 'hardware', name: 'Helat ja kuvio', parentId: 'cabinet', hidden: false },
  ];
  project.bodies = project.bodies.map((b) => ({
    ...b,
    groupId: 'frame',
    material: undefined,
    appearance: defaultAppearance('oak-light'),
    color: findPreset('oak-light').color,
  }));
  const doors = [
    makeBody(296, 18, 796, [2, -22, 2], 'Vasen ovi'),
    makeBody(296, 18, 796, [302, -22, 2], 'Oikea ovi'),
  ].map((body, i) => {
    const shape = createShape(body),
      indices = meshBody(body, shape).detailEdges!.map((e) => e.index);
    shape.delete();
    const result = detailEdges(body, indices, 'fillet', 2).body;
    return {
      ...result,
      groupId: 'doors',
      purpose: 'component' as const,
      appearance: {
        ...defaultAppearance('oak'),
        texture: {
          ...defaultAppearance('oak').texture,
          width: 260,
          height: 900,
          offsetX: i * 75,
          rotation: 0,
        },
      },
      color: findPreset('oak').color,
    };
  });
  const hardware = [260, 334].map((x, i) => ({
    ...makeProfileBody(
      { kind: 'circle', radius: 4 },
      sketchFrame([x, -35, 310]),
      180,
      `Messinkivedin ${i + 1}`,
    ),
    groupId: 'hardware',
    appearance: defaultAppearance('brass'),
    color: findPreset('brass').color,
  }));
  const bytes = inlayPNG(),
    assetId = createHash('sha256').update(bytes).digest('hex');
  project.assets = {
    [assetId]: {
      name: 'nivo-kuvio.png',
      dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
      width: 64,
      height: 128,
    },
  };
  const inlay = {
    ...makeBody(65, 1, 130, [60, -23, 540], 'Tuotu pintakuvio'),
    groupId: 'hardware',
    color: '#ffffff',
    appearance: {
      ...defaultAppearance('paint'),
      assetId,
      texture: { width: 65, height: 130, offsetX: 0, offsetY: 0, rotation: 0, lockAspect: true },
    },
  };
  project.bodies.push(...doors, ...hardware, inlay);
  const a: [number, number, number] = [298, -13, 730],
    b: [number, number, number] = [302, -13, 730];
  const gap: PointDimension = {
    id: 'door-gap',
    kind: 'points',
    start: referenceAnchor(doors[0], a),
    end: referenceAnchor(doors[1], b),
    fallback: [a, b],
    axis: 'x',
    offset: [0, 0, 130],
    normal: [0, 1, 0],
  };
  project.dimensions = [gap];
  project = addBodyDimensions(project, [project.bodies[0].id], ['z']);
  project.materials = [
    {
      id: 'cabinet-oak',
      name: 'Kaapin tammipinta',
      color: findPreset('oak').color,
      appearance: doors[0].appearance,
    },
  ];
  project.settings.render = { environment: 'studio', exposure: 1, shadows: true };
  const restored = parseProject(JSON.stringify(project));
  expect(restored.bodies.filter((b) => b.edgeTreatment)).toHaveLength(2);
  expect(restored.assets?.[assetId].dataUrl).toContain('image/png');
  for (const body of restored.bodies) {
    const shape = createShape(body);
    expect(meshBody(body, shape).volume).toBeGreaterThan(0);
    shape.delete();
  }
  if (process.env.NIVO_WRITE_EXAMPLE === '1') {
    mkdirSync('public/examples', { recursive: true });
    writeFileSync('public/examples/viimeistelty-kaappi.nivo', JSON.stringify(restored));
  }
});
