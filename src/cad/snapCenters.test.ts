import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createShape, meshBody, bodyFromShape } from './kernel';
import { makeBody } from '../model/project';
import { modelSnapPoints } from '../model/snap';
import { surfaceCenters } from '../model/surfaceCenters';
import { translateMesh } from './translateMesh';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30_000,
);

it('a saved floor exposes its actual top-face center instead of its buried volume center', () => {
  const source = makeBody(2238, 2077, 100, [-100, -110, -100]);
  const shape = createShape(source);
  try {
    const body = bodyFromShape(source, shape, []);
    const mesh = meshBody(body, shape);
    const points = modelSnapPoints([body], [mesh], 'surface');
    const center = points.find(
      (p) => p.label === 'Pinnan keskipiste' && Math.abs(p.point[2]) < 1e-6,
    )!;
    expect(center.point[0]).toBeCloseTo(1019, 7);
    expect(center.point[1]).toBeCloseTo(928.5, 7);
    expect(points.some((p) => p.key === `${body.id}:center`)).toBe(false);
    expect(modelSnapPoints([body], [mesh]).find((p) => p.key.endsWith(':center'))!.point).toEqual([
      1019, 928.5, -50,
    ]);
    const moved = { ...body, id: 'copy', origin: [0, -110, -100] as [number, number, number] };
    const translated = translateMesh(mesh, moved.id, [100, 0, 0]);
    const movedCenter = modelSnapPoints([moved], [translated], 'surface').find((p) =>
      p.key.endsWith(center.key.slice(body.id.length)),
    )!;
    expect(movedCenter.point[0]).toBeCloseTo(1119, 7);
    expect(center.point[0]).toBeCloseTo(1019, 7);
  } finally {
    shape.delete();
  }
});

it('a hole does not offer a phantom point on the missing surface', () => {
  const source = makeBody(100, 100, 10);
  const outer = createShape(source),
    inner = createShape(makeBody(40, 40, 30, [30, 30, -10]));
  const ring = outer.asShape3D().cut(inner.asShape3D());
  try {
    const mesh = meshBody(bodyFromShape(source, ring, []), ring);
    expect(
      surfaceCenters(mesh).some(
        (p) => Math.abs(p.point[0] - 50) < 1e-6 && Math.abs(p.point[1] - 50) < 1e-6,
      ),
    ).toBe(false);
  } finally {
    ring.delete();
    inner.delete();
    outer.delete();
  }
});
