import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { booleanBodies } from '../src/cad/operations';
import { asComponent } from '../src/model/components';
import { ready, view, save, revealBrowser } from './helpers';

let perforated: Body;
test.beforeAll(async () => {
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  );
  const holes = Array.from({ length: 32 }, (_, i) =>
    makeProfileBody(
      { kind: 'circle', radius: 8 },
      sketchFrame([50 + (i % 8) * 42, 50 + Math.floor(i / 8) * 62, -1]),
      22,
    ),
  );
  perforated = asComponent(booleanBodies([makeBody(400, 300, 20)], holes, 'cut')[0]);
});

test('a perforated part highlights without a duplicate mesh, drags to an exact target and copies once', async ({
  page,
}) => {
  const target = makeBody(80, 80, 20, [557.375, 0, 0]);
  await ready(page, [perforated, target]);
  const p = await view(page, [perforated, target]);
  await revealBrowser(page);
  await page.getByTestId(`body-${perforated.id}`).press('Enter');
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
  const canvas = page.getByTestId('viewport');
  await page.mouse.move(5, 5);
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  const builds = await canvas.getAttribute('data-geometry-builds');
  await page.keyboard.press('m');
  await expect(canvas).toHaveAttribute('data-move-preview', 'false');
  // Let the tool-change shadow pass finish before comparing steady frame counts.
  const empty = p(-20, -20, 20);
  await page.mouse.move(empty.x, empty.y);
  // The old zero-distance ghost rendered the entire perforated part twice.
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-triangles')))
    .toBeLessThan(triangles + 1000);
  const start = p(400, 0, 20),
    end = p(557.375, 0, 20);
  await page.mouse.move(start.x, start.y);
  await expect(canvas).toHaveAttribute('data-move-hovered', JSON.stringify([perforated.id]));
  await expect(page.getByTestId('snap-hint')).toContainText('Verteksi');
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  await page.mouse.down();
  const grab = JSON.parse((await canvas.getAttribute('data-move-grab'))!);
  [400, 0, 20].forEach((n, i) => expect(grab[i]).toBeCloseTo(n, 5));
  await page.keyboard.press('x');
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-move-preview', 'true');
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  await expect(page.getByTestId('snap-hint')).toContainText('Verteksi');
  await page.keyboard.press('Control');
  await expect(canvas).toHaveAttribute('data-copy-move', 'true');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(3);
  expect(result.bodies.slice(0, 2)).toEqual([perforated, target]);
  const copy = result.bodies[2];
  expect(copy.origin[0] - perforated.origin[0]).toBeCloseTo(157.375, 5);
  expect(copy.origin[1]).toBeCloseTo(perforated.origin[1], 5);
  expect(copy.origin[2]).toBeCloseTo(perforated.origin[2], 5);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([perforated, target]);
});
