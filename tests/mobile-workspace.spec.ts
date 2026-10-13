import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody } from '../src/model/project';
import { ready } from './helpers';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
test.describe.configure({ timeout: 90000 });
async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('nivo-mobile-start', 'off'));
  await ready(page);
}
async function header(page: Page) {
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
}
async function draw(page: Page, reverse = false) {
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  const a = { x: rect.x + (reverse ? 230 : 75), y: rect.y + (reverse ? 300 : 210) };
  const b = { x: rect.x + (reverse ? 75 : 230), y: rect.y + (reverse ? 210 : 300) };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function download(page: Page) {
  await header(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).tap();
  const project = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  await header(page);
  return project;
}

test('phone fits portrait and landscape; fullscreen, tools, list and properties are reachable', async ({
  page,
}) => {
  await start(page);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'true');
    await expect(
      page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Avaa ominaisuudet', exact: true }),
    ).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const canvas = (await page.getByTestId('viewport').boundingBox())!;
    expect(canvas.width).toBeGreaterThan(viewport.width - 65);
    await page.getByRole('button', { name: 'Avaa ominaisuudet', exact: true }).tap();
    const inspector = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
    await expect(inspector).toBeVisible();
    await expect(
      inspector.getByRole('button', { name: 'Sulje ominaisuudet', exact: true }),
    ).toBeInViewport();
    expect((await page.getByTestId('viewport').boundingBox())!.width).toBe(canvas.width);
    await inspector.getByRole('button', { name: 'Sulje ominaisuudet', exact: true }).tap();
    await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).tap();
    await expect(page.getByRole('complementary', { name: 'Mallilista' })).toHaveAttribute(
      'data-expanded',
      'true',
    );
    await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).tap();
  }
  await page.screenshot({ path: test.info().outputPath('mobile-320.png') });
});

test('touch rectangle waits for dimensions; keyboard Enter does not commit; accept and undo once', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).tap();
  await expect(page.getByTestId('dynamic-input')).toBeHidden();
  await draw(page, true);
  const review = page.getByRole('region', { name: 'Tarkista mitat' });
  await expect(review).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.getByTestId('width-input').fill('180');
  await page.getByTestId('width-input').press('Enter');
  await expect(page.getByTestId('depth-input')).toBeFocused();
  await page.getByTestId('depth-input').fill('120');
  await page.getByTestId('depth-input').press('Enter');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  // Resize like a mobile keyboard: acceptance stays available without moving the drawing origin.
  await page.setViewportSize({ width: 390, height: 380 });
  await expect(review.getByRole('button', { name: 'Hyväksy muoto', exact: true })).toBeInViewport();
  await expect(page.getByTestId('depth-input')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('mobile-dimensions.png') });
  await review.getByRole('button', { name: 'Hyväksy muoto', exact: true }).tap();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const model = await download(page);
  expect(model.bodies).toHaveLength(1);
  expect(
    [model.bodies[0].feature.width, model.bodies[0].feature.depth].sort((a, b) => a - b),
  ).toEqual([120, 180]);
  await header(page);
  await page.getByRole('button', { name: 'Peru', exact: true }).tap();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
});

test('circle can be sized after touch drawing; cancel and switching tools leave no geometry', async ({
  page,
}) => {
  await start(page);
  // Use the normal shape menu; no keyboard required to discover or start the tool.
  await page.getByRole('button', { name: 'Muodot', exact: true }).tap();
  await page
    .getByRole('group', { name: 'Valitse muoto' })
    .getByRole('button', { name: /Ympyrä/ })
    .tap();
  await draw(page);
  await expect(page.getByRole('region', { name: 'Tarkista mitat' })).toBeVisible();
  await page.getByTestId('diameter-input').fill('64');
  await page
    .getByRole('region', { name: 'Tarkista mitat' })
    .getByRole('button', { name: 'Peruuta', exact: true })
    .tap();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await draw(page);
  await page.getByTestId('diameter-input').fill('80');
  await page.getByRole('button', { name: 'Hyväksy muoto', exact: true }).tap();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const model = await download(page);
  expect(model.bodies[0].feature.width).toBeCloseTo(80);
  expect(model.bodies[0].feature.depth).toBeCloseTo(80);
});

test('two-finger navigation does not create a shape or open acceptance', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).tap();
  const cdp = await page.context().newCDPSession(page);
  const points = [
    { x: 170, y: 380, id: 1 },
    { x: 280, y: 430, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: points.map((p) => ({ ...p, x: p.x + 20, y: p.y + 20 })),
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('region', { name: 'Tarkista mitat' })).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await draw(page);
  await expect(page.getByRole('region', { name: 'Tarkista mitat' })).toBeVisible();
  await cdp.detach();
});

test('shared file preserves identity and opening a changed local version keeps both versions', async ({
  page,
}) => {
  await start(page);
  const project = { ...freshProject(), name: 'Puhelinprojekti', bodies: [makeBody(90, 60, 20)] };
  await page.getByTestId('project-file').setInputFiles({
    name: 'test.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await header(page);
  await page.getByRole('button', { name: 'Jatka toisella laitteella', exact: true }).tap();
  const share = page.getByRole('dialog', { name: 'Jatka toisella laitteella', exact: true });
  const pending = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Lataa siirtotiedosto', exact: true }).tap();
  const data = await readFile((await (await pending).path())!);
  const transferred = JSON.parse(data.toString());
  expect(transferred.transfer.projectId).toBe(transferred.id);
  await share.getByRole('button', { name: 'Sulje jakaminen', exact: true }).tap();
  const name = page.getByLabel('Projektin nimi', { exact: true });
  await name.fill('Tietokoneen muutos');
  await name.press('Enter');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page
    .getByTestId('project-file')
    .setInputFiles({ name: 'shared.nivo', mimeType: 'application/json', buffer: data });
  await expect(name).toHaveValue('Puhelinprojekti · tuotu versio');
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).tap();
  await expect(
    page.getByRole('dialog', { name: 'Projektikirjasto', exact: true }).locator('.library-card'),
  ).toHaveCount(2);
});

test('fullscreen starts with one tap and its preference can be disabled; unsupported browser gets installation guidance', async ({
  page,
}) => {
  await ready(page);
  const start = page.getByRole('dialog', { name: 'Enemmän tilaa mallille' });
  await expect(start).toBeVisible();
  await start.getByRole('checkbox').uncheck();
  await start.getByRole('button', { name: 'Aloita koko näytöllä' }).tap();
  await expect(
    page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true }).tap();
  await page.reload();
  await expect(start).toBeHidden();
  await page.evaluate(() =>
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }),
  );
  // Trigger a React render so support detection follows the simulated browser capability.
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
  await page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }).tap();
  await expect(start).toContainText('kotinäytölle');
  await start.getByRole('button', { name: 'Jatka mallintamaan', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
  ).toBeInViewport();
});

test('a mouse still commits immediately in a small window and resizing restores desktop inspector', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).click();
  const canvas = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.move(canvas.x + 75, canvas.y + 210);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 230, canvas.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await expect(page.getByRole('region', { name: 'Tarkista mitat' })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'false');
  await expect(
    page.getByRole('complementary', { name: 'Ominaisuudet', exact: true }),
  ).toBeVisible();
});

test('render keeps the viewport wide and its settings can be opened and closed on mobile', async ({
  page,
}) => {
  await start(page);
  const model = { ...freshProject(), bodies: [makeBody(180, 120, 60)] };
  await page.getByTestId('project-file').setInputFiles({
    name: 'box.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('combobox', { name: 'Työtila', exact: true }).selectOption('render');
  const settings = page.getByRole('complementary', { name: 'Renderöinnin asetukset' });
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: 'Pinnat ja valot', exact: true }).tap();
  await expect(settings).toBeVisible();
  await page.getByRole('button', { name: 'Sulje säädöt', exact: true }).tap();
  await expect(settings).toBeHidden();
  await page.getByRole('combobox', { name: 'Työtila', exact: true }).selectOption('model');
  await expect(page.getByTestId('viewport')).toBeVisible();
});

test.describe('tablet touch', () => {
  test.use({ viewport: { width: 1194, height: 834 } });
  test('uses dimension review with touch while keeping the desktop-sized layout', async ({
    page,
  }) => {
    await start(page);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'false');
    await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).tap();
    // The desktop browser panel can overlap the first contact, so collapse it explicitly.
    await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).tap();
    await draw(page);
    await expect(page.getByRole('region', { name: 'Tarkista mitat' })).toBeVisible();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
    await page.getByTestId('width-input').fill('240');
    await page.getByTestId('depth-input').fill('180');
    await page.getByRole('button', { name: 'Hyväksy muoto', exact: true }).tap();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  });
});
