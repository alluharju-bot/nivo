import { test, expect, type Page } from '@playwright/test';
import { makeBody, isPointDimension } from '../src/model/project';
import { ready, view, click, save, revealBrowser } from './helpers';

async function selectListed(page: Page, id: string) {
  const expanded = await page
    .getByRole('complementary', { name: 'Mallilista' })
    .getAttribute('data-expanded');
  await revealBrowser(page);
  await page.getByTestId(`body-${id}`).click();
  if (expanded === 'false') await page.getByRole('button', { name: 'Piilota mallilista' }).click();
}

test('retained fillet reopens, adds a meeting edge, changes size and can be removed', async ({
  page,
}) => {
  const body = {
    ...makeBody(600, 600, 18, [0, 0, 0], 'Ovi'),
    groupId: 'panels',
  };
  await ready(page, [body], [], [{ id: 'panels', name: 'Ovilevyt', hidden: false }]);
  const p = await view(page, [body]);
  await selectListed(page, body.id);
  await page.keyboard.press('f');
  await click(page, p(240, 0, 18));
  await page.getByTestId('detail-size').fill('3');
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const first = await save(page);
  expect(first.bodies[0].edgeTreatment?.indices).toHaveLength(1);
  await page.keyboard.press('Escape');
  await selectListed(page, body.id);
  await page.keyboard.press('f');
  await expect(page.getByTestId('detail-size')).toHaveValue('3');
  await click(page, p(0, 240, 18));
  await page.getByTestId('detail-size').fill('2');
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const next = await save(page);
  expect(next.bodies[0].edgeTreatment?.indices).toHaveLength(2);
  expect(next.bodies[0].edgeTreatment?.id).toBe(first.bodies[0].edgeTreatment?.id);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId(`body-${body.id}`)).toBeVisible();
  await selectListed(page, body.id);
  await page.keyboard.press('f');
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Kiinnitä ryhmä: Ovilevyt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Poista käsittely', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Hyväksy reunakäsittely',
      exact: true,
    }),
  ).toBeDisabled();
  expect((await save(page)).bodies[0].edgeTreatment?.size).toBe(2);
  await page.getByRole('button', { name: 'Vapauta ryhmä: Ovilevyt', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kiinnitä ryhmä: Ovilevyt', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Poista käsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].edgeTreatment).toBeUndefined();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].edgeTreatment?.size).toBe(2);
});

test('two-point dimensions snap, place, drag and export without changing solids', async ({
  page,
}, info) => {
  const a = makeBody(100, 100, 20, [0, 0, 0], 'Vasen'),
    b = makeBody(100, 100, 20, [137, 0, 0], 'Oikea');
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await page.keyboard.press('t');
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Dimensio/ }).click();
  await click(page, p(100, 0, 20));
  await page.mouse.move(p(137, 0, 20).x, p(137, 0, 20).y);
  await click(page, p(137, 0, 20));
  await page.mouse.move(p(118, -40, 20).x, p(118, -40, 20).y);
  await click(page, p(118, -40, 20));
  await expect(page.getByTestId('dimension-3d')).toHaveAttribute('data-mm', '37');
  let result = await save(page);
  expect(result.dimensions).toHaveLength(1);
  expect(result.bodies).toEqual([a, b]);
  const d = result.dimensions[0];
  expect(isPointDimension(d)).toBe(true);
  if (!isPointDimension(d)) throw new Error('point dimension missing');
  expect(d.offset[1]).toBeCloseTo(-40, 2);
  await page.keyboard.press('Escape');
  const label = page.getByTestId('dimension-3d').locator('text');
  await expect(label).toBeVisible();
  let box!: NonNullable<Awaited<ReturnType<typeof label.boundingBox>>>;
  await expect
    .poll(async () => {
      const found = await label.boundingBox();
      if (found) box = found;
      return !!found;
    })
    .toBe(true);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 45, {
    steps: 4,
  });
  await page.mouse.up();
  result = await save(page);
  expect(result.dimensions[0]).not.toEqual(d);
  await page.screenshot({ path: info.outputPath('point-dimension.png') });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Yläkuva', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-dimension]')).toHaveAttribute('data-mm', '37');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('dimension-3d')).toHaveAttribute('data-mm', '37');
});

test('move uses the same visible grab point and exact destination with grid enabled', async ({
  page,
}, info) => {
  const a = makeBody(100, 80, 20, [0, 0, 0], 'Siirrettävä'),
    b = makeBody(120, 100, 20, [257.375, 143.625, 0], 'Kohde');
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await selectListed(page, a.id);
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  const start = p(100, 80, 20),
    end = p(257.375, 143.625, 20);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Verteksi');
  await page.mouse.down();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-grab', '[100,80,20]');
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await expect(page.getByTestId('snap-hint')).toContainText('Tartunta');
  await page.screenshot({ path: info.outputPath('move-snap.png') });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const moved = (await save(page)).bodies[0];
  expect(moved.origin[0]).toBeCloseTo(157.375, 6);
  expect(moved.origin[1]).toBeCloseTo(63.625, 6);
  expect(moved.origin[2]).toBeCloseTo(0, 6);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(a);
});

test('texture editor previews, cancels, commits one step and restores imported images', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 40, [0, 0, 0], 'Tekstuuri');
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption('oak');
  await page
    .getByRole('combobox', { name: 'Materiaalin kohde', exact: true })
    .selectOption(body.id);
  await page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Kuvion leveys', exact: true }).fill('150');
  await expect(page.getByRole('spinbutton', { name: 'Kuvion korkeus', exact: true })).toHaveValue(
    '300',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('render-canvas')).toBeVisible();
  expect((await save(page)).bodies[0].appearance?.texture.width).toBe(300);
  await page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Kuvion leveys', exact: true }).fill('180');
  await page.getByRole('spinbutton', { name: 'Tekstuurin kierto', exact: true }).fill('35');
  const canvas = page.getByTestId('render-canvas'),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.43, box.y + box.height * 0.48, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Siirtymä U', exact: true })).not.toHaveValue(
    '0',
  );
  await page.screenshot({ path: info.outputPath('texture-edit.png') });
  await page.getByRole('button', { name: 'Hyväksy tekstuuri · Enter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true })).toBeEnabled();
  const accepted = (await save(page)).bodies[0];
  expect(accepted.appearance?.texture.width).toBe(180);
  expect(accepted.appearance?.texture.rotation).toBe(35);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.texture.width).toBe(300);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(accepted);
  await page.keyboard.press('Escape');
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 16;
    const x = c.getContext('2d')!;
    x.fillStyle = '#da5030';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#20b894';
    x.fillRect(16, 0, 16, 16);
    return c.toDataURL().split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Lisää kuva', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'testi.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.locator('.render-panel')).toContainText('testi.png');
  const imported = await save(page);
  expect(Object.keys(imported.assets ?? {})).toHaveLength(1);
  expect(imported.bodies[0].appearance?.assetId).toBe(Object.keys(imported.assets!)[0]);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Renderöi', exact: true })).toBeEnabled();
  expect((await save(page)).assets).toEqual(imported.assets);
  expect(errors).toEqual([]);
});

test('move snaps edge points and axis references and obeys a saved grid step', async ({ page }) => {
  const a = makeBody(100, 80, 20),
    b = makeBody(120, 100, 20, [257.375, 143.625, 0]);
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await page.locator('.viewport-settings summary').click();
  const step = page.getByRole('spinbutton', {
    name: 'Ruudukon askel',
    exact: true,
  });
  await step.fill('0');
  await step.press('Enter');
  await expect(step).toHaveValue('10');
  await step.fill('25');
  await step.press('Enter');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await expect
    .poll(
      async () => Number(await page.locator('.viewport').getAttribute('data-grid-spacing')) % 25,
    )
    .toBe(0);
  await page.locator('.viewport-settings summary').click();
  await selectListed(page, a.id);
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  const start = p(27, 80, 20),
    end = p(284.375, 143.625, 20);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Reuna');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.getByTestId('snap-hint')).toContainText('Tartunta · Reuna');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  // Interior edge points depend on browser pointer precision; the perpendicular contact stays exact.
  expect(result.bodies[0].origin[0]).toBeCloseTo(257.375, 4);
  expect(result.bodies[0].origin[1]).toBeCloseTo(63.625, 6);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Palauta', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await selectListed(page, a.id);
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  const corner = p(100, 80, 20);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.keyboard.press('x');
  const ref = p(257.375, 143.625, 20);
  await page.mouse.move(ref.x, ref.y, { steps: 8 });
  await expect(page.getByTestId('snap-hint')).toContainText('Akselin mitta');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies[0].origin[0]).toBeCloseTo(157.375, 5);
  expect(result.bodies[0].origin[1]).toBeCloseTo(0, 5);
  expect(result.settings.gridStep).toBe(25);
});

test('texture handles resize and rotate, and right-button surface orbit remains available', async ({
  page,
}) => {
  const body = makeBody(300, 200, 40);
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption('walnut');
  await page
    .getByRole('combobox', { name: 'Materiaalin kohde', exact: true })
    .selectOption(body.id);
  await page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true }).click();
  const size = (await page
    .getByRole('button', { name: 'Skaalaa tekstuuria', exact: true })
    .boundingBox())!;
  await page.mouse.move(size.x + 17, size.y + 17);
  await page.mouse.down();
  await page.mouse.move(size.x + 47, size.y + 2, { steps: 6 });
  await page.mouse.up();
  const width = Number(
    await page.getByRole('spinbutton', { name: 'Kuvion leveys', exact: true }).inputValue(),
  );
  expect(width).toBeGreaterThan(300);
  expect(
    Number(
      await page.getByRole('spinbutton', { name: 'Kuvion korkeus', exact: true }).inputValue(),
    ),
  ).toBeCloseTo(width * 2, 1);
  const rotation = (await page
    .getByRole('button', { name: 'Kierrä tekstuuria', exact: true })
    .boundingBox())!;
  await page.mouse.move(rotation.x + 17, rotation.y + 17);
  await page.mouse.down();
  await page.mouse.move(rotation.x + 30, rotation.y + 55, { steps: 6 });
  await page.mouse.up();
  await expect(
    page.getByRole('spinbutton', { name: 'Tekstuurin kierto', exact: true }),
  ).not.toHaveValue('0');
  const canvas = page.getByTestId('render-canvas'),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.48);
  await page.mouse.down({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-orbit-pivot', /\[/);
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.48, {
    steps: 4,
  });
  await page.mouse.up({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-orbit-pivot', '');
  await expect(page.getByRole('spinbutton', { name: 'Kuvion leveys', exact: true })).toHaveValue(
    String(width),
  );
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies[0].appearance?.texture.width).toBeCloseTo(width, 2);
});

test('finished cabinet opens with editable rounds, dimensions, materials and an embedded image', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('button', { name: /^Viimeistelty kaappi/ }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(11);
  const project = await save(page);
  expect(project.bodies.filter((b) => b.edgeTreatment)).toHaveLength(2);
  expect(project.dimensions).toHaveLength(2);
  expect(Object.keys(project.assets ?? {})).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath('finished-cabinet-model.png'),
  });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-body-count', '11');
  await page.screenshot({
    path: info.outputPath('finished-cabinet-render.png'),
  });
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('combobox', { name: 'Kuvan leveys', exact: true }).selectOption('1600');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna PNG', exact: true }).click();
  await (await pending).saveAs(info.outputPath('finished-cabinet.png'));
});
