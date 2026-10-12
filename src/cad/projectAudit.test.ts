import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { parseProject } from '../model/project';
import { captureQuantityBases } from '../model/quantityBasis';
import { quantityRows } from '../model/quantities';
import { createShape, meshBody } from './kernel';
import { detailEdges } from './details';

const model = process.env.NIVO_AUDIT_MODEL;
beforeAll(async () => {
  if (model)
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    );
}, 30000);
it.skipIf(!model)(
  'audits local profiled stock and repeated curved edge operations without storing model data',
  () => {
    const project = parseProject(readFileSync(model!, 'utf8'));
    const meshes = project.bodies.map((body) => {
      const shape = createShape(body);
      try {
        return meshBody(body, shape);
      } finally {
        shape.delete();
      }
    });
    const measured = captureQuantityBases(project, meshes);
    const rows = quantityRows(measured, measured.bodies, meshes);
    console.log(
      'QUANTITY AUDIT',
      rows.map((r) => ({ type: r.name, count: r.count, missing: r.missing, total: r.total })),
    );
    for (const row of rows) expect(row.missing).toBe(0);
    expect(
      measured.bodies.every((b) =>
        b.quantityBasis?.dimensions.every((n, i, d) => !i || d[i - 1] >= n),
      ),
    ).toBe(true);
    const handle = measured.bodies.at(-1)!;
    const mesh = meshes.at(-1)!;
    const results: { index: number; passed: boolean }[] = [];
    for (const edge of mesh.detailEdges ?? []) {
      try {
        const result = detailEdges(handle, [edge.index], 'fillet', 0.5, false);
        expect(result.body.edgeTreatment?.source).toEqual(handle.feature);
        results.push({ index: edge.index, passed: true });
      } catch {
        results.push({ index: edge.index, passed: false });
      }
    }
    console.log('HANDLE AUDIT', {
      eligible: results.length,
      successful: results.filter((r) => r.passed).map((r) => r.index),
    });
    expect(results.some((r) => r.passed)).toBe(true);
    expect(meshes.some((m) => m.faces.some((f) => f.cylinder))).toBe(true);
  },
  120000,
);
