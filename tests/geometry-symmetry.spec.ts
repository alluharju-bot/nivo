import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeProfileBody, parseProject } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { prepareGeometry } from '../src/cad/geometryEditing';
import { createShape, meshBody } from '../src/cad/kernel';
import { validateGeometry } from '../src/model/geometryEditing';
import { ready, view, save } from './helpers';
import { panel, open, projected } from './precision-helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

test('a symmetric edge stays symmetric after preview, acceptance, undo and reload', async ({
  page,
  browser,
}, info) => {
  const modelPath = process.env.NIVO_SYMMETRY_MODEL;
  const body = modelPath
    ? parseProject(readFileSync(modelPath, 'utf8')).bodies.find((b) => b.purpose === 'model')!
    : makeProfileBody(
        {
          kind: 'polygon',
          points: [
            [-300, 0],
            [-125, 175],
            [125, 175],
            [300, 0],
            [150, -370],
            [-150, -370],
          ],
        },
        sketchFrame([0, 0, 0]),
        250,
      );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const beforePath = process.env.NIVO_SYMMETRY_BEFORE;
  if (beforePath) {
    const before = parseProject(readFileSync(beforePath, 'utf8')).bodies.find(
      (b) => b.purpose === 'model',
    )!;
    const context = await browser.newContext({
      baseURL: new URL(process.env.NIVO_BASE_PATH ?? '/', info.project.use.baseURL!).origin,
      viewport: { width: 1440, height: 960 },
    });
    try {
      const beforePage = await context.newPage();
      await ready(beforePage, [before]);
      await view(beforePage, [before]);
      await open(beforePage, before);
      await beforePage.screenshot({ path: info.outputPath('original-saved-surface.png') });
    } finally {
      await context.close();
    }
  }
  const original = prepareGeometry(body),
    y = Math.min(...original.points.map((p) => p[1])),
    z = Math.max(...original.points.map((p) => p[2])),
    edge = original.points.filter((p) => Math.abs(p[1] - y) < 1e-4 && Math.abs(p[2] - z) < 1e-4);
  expect(edge).toHaveLength(2);
  await ready(page, [body]);
  await view(page, [body]);
  await open(page, body);
  const project = await projected(page),
    at = project((edge[0][0] + edge[1][0]) / 2, y, z);
  await page.mouse.click(at.x, at.y);
  await expect(panel(page).getByRole('status')).toContainText('2 pistettä');
  const input = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await input.fill('-40');
  await page.screenshot({ path: info.outputPath('symmetric-preview.png') });
  await input.press('Enter');
  await expect(input).toHaveValue('0');
  const result = await save(page),
    changed = result.bodies[0];
  const shape = createShape(changed);
  try {
    const top = meshBody(changed, shape).faces.filter((f) => f.normal[2] > 0.9);
    expect(top).toHaveLength(2);
    top.forEach((f) => expect(f.normal[0]).toBeCloseTo(0, 5));
  } finally {
    shape.delete();
  }
  const accepted = prepareGeometry(changed);
  expect(() => validateGeometry(accepted, accepted.points)).not.toThrow();
  expect(
    accepted.points.filter((p) => Math.abs(p[1] - y) < 1e-4 && Math.abs(p[2] - (z - 40)) < 1e-4),
  ).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('symmetric-accepted.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].feature).toEqual(body.feature);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(result.bodies);
  expect(errors).toEqual([]);
});
