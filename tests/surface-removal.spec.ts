import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea, type Shape3D } from 'replicad';
import { makeProfileBody, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { createShape, meshBody, pushPullFace } from '../src/cad/kernel';
import { offsetFace } from '../src/cad/operations';
import { ready, view, save, editBody } from './helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);
function inspect(body: Body) {
  const shape = createShape(body);
  try {
    return { mesh: meshBody(body, shape), area: measureArea(shape as Shape3D) };
  } finally {
    shape.delete();
  }
}
function circle() {
  return makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 0, 'Rengas');
}
function rim() {
  const disk = circle(),
    offset = offsetFace(disk, inspect(disk).mesh.faces[0].ref, -8);
  return pushPullFace(offset.body, offset.face, 50);
}

test('circle → outward offset 8 → pull 50 → edit → select centre → X removes only the surface; undo, Delete, reload and solid protection work', async ({
  page,
}, info) => {
  const disk = circle();
  await ready(page, [disk]);
  const point = await view(page, [disk]);
  const centre = point(0, 0);
  await page.mouse.move(centre.x, centre.y);
  await page.keyboard.press('o');
  await page.getByTestId('offset-input').fill('-8');
  await page.getByTestId('offset-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('50');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const raised = await save(page),
    before = inspect(raised.bodies[0]);
  await page.keyboard.press('v');
  await editBody(page, disk.id);
  await page.mouse.click(centre.x, centre.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selection-kind', 'face');
  await expect(page.getByRole('button', { name: 'Poista pinta', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('selected-centre.png') });
  await page.keyboard.press('x');
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText(
    'Pinta poistettu. Peru palauttaa sen.',
  );
  const removed = await save(page),
    after = inspect(removed.bodies[0]);
  expect(removed.bodies).toHaveLength(1);
  expect(after.mesh.volume).toBeCloseTo(before.mesh.volume, 4);
  expect(before.area - after.area).toBeCloseTo(Math.PI * 100 ** 2, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(raised.bodies);
  await page.mouse.click(centre.x, centre.y);
  // An explicitly selected surface remains the deletion target with E active.
  await page.keyboard.press('e');
  await expect(page.getByTestId('height-input')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText(
    'Pinta poistettu. Peru palauttaa sen.',
  );
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const reopened = await save(page);
  expect(inspect(reopened.bodies[0]).mesh.faces).toHaveLength(before.mesh.faces.length - 1);
  const p = await view(page, reopened.bodies);
  await editBody(page, disk.id);
  const edge = p(104, 0, 50);
  await page.mouse.click(edge.x, edge.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selection-kind', 'face');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('alert')).toContainText('umpinaista');
  expect((await save(page)).bodies).toEqual(reopened.bodies);
  await page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }).click();
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('open-ring.png') });
});

test('Cut accepts a 40 mm cylinder touching the centre plane, keeps the 50 mm walls and restores all parts with undo', async ({
  page,
}) => {
  const body = rim(),
    before = inspect(body);
  const cutter = makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, 0]),
    40,
    'Leikkuri',
  );
  await ready(page, [body, cutter]);
  await page.keyboard.press('b');
  await page.getByRole('checkbox', { name: 'Kohde: Rengas', exact: true }).check();
  await page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Työstökappale: Leikkuri', exact: true }).check();
  await page.getByLabel('Säilytä työstökappaleet', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const cut = await save(page),
    after = inspect(cut.bodies[0]);
  expect(after.mesh.volume).toBeCloseTo(before.mesh.volume, 4);
  expect(before.area - after.area).toBeCloseTo(Math.PI * 100 ** 2, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body, cutter]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(cut.bodies);
});

test('Delete in an opened part needs a selected face; outside edit mode normal clicks still select and delete the entire part', async ({
  page,
}) => {
  const disk = circle();
  await ready(page, [disk]);
  const point = await view(page, [disk]),
    p = point(0, 0);
  await editBody(page, disk.id);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Delete');
  expect((await save(page)).bodies).toEqual([disk]);
  await page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }).click();
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selection-kind', 'object');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await editBody(page, disk.id);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([disk]);
});
