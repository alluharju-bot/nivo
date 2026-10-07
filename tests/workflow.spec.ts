import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
}
async function rectangle(page: Page) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).click();
  await page.keyboard.type('600');
  await page.getByTestId('width-input').fill('600');
  await page.getByTestId('depth-input').fill('400');
  await page.getByRole('button', { name: 'Hyväksy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Anna paksuus', exact: true })).toBeVisible();
}
async function extrude(page: Page, height = '18 mm') {
  await page.getByRole('button', { name: 'Push / pull', exact: true }).click();
  await page.getByTestId('height-input').fill(height);
  await page.getByRole('button', { name: 'Hyväksy', exact: true }).click();
  await expect(page.getByTestId('selected-height')).toContainText(height.replace(' mm', ''));
}

test('real CAD worker: extrusion, boolean, fillet, BRep round-trip, HLR and cancellation', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NIVO_PREVIEW === '1',
    'Development-only entry point; production tested through UI workflows.',
  );
  await ready(page);
  const probe = await page.evaluate(async () => {
    const url = '/src/cad/client.ts';
    const { CadClient } = await import(url);
    const cad = new CadClient();
    try {
      const interrupted = cad.build([]).then(
        () => false,
        () => true,
      );
      cad.cancel();
      const canceled = await interrupted;
      const probe = await cad.probe();
      const modelUrl = '/src/model/project.ts';
      const { makeBody } = await import(modelUrl);
      const bodies = Array.from({ length: 200 }, (_, i) =>
        makeBody(600, 400, 18, [(i % 20) * 650, Math.floor(i / 20) * 450, 0]),
      );
      const started = performance.now();
      const built = await cad.build(bodies);
      const build200Ms = performance.now() - started;
      const invalid = { ...bodies[0], feature: { ...bodies[0].feature, width: -1 } };
      const rejected = await cad.build([invalid]).then(
        () => false,
        () => true,
      );
      const restored = await cad.build([bodies[0]]);
      return {
        ...probe,
        canceled,
        build200Ms,
        count200: built.length,
        rejected,
        recoveredVolume: restored[0].volume,
      };
    } finally {
      cad.cancel();
    }
  });
  expect(probe.canceled).toBe(true);
  expect(probe.valid).toBe(true);
  expect(probe.boxVolume).toBeCloseTo(4_320_000, 3);
  expect(probe.cutVolume).toBeCloseTo(4_140_000, 3);
  expect(probe.restoredVolume).toBeCloseTo(probe.boxVolume, 3);
  expect(probe.faceCount).toBe(6);
  expect(probe.frontPaths).toBeGreaterThan(0);
  expect(probe.count200).toBe(200);
  expect(probe.rejected).toBe(true);
  expect(probe.recoveredVolume).toBeCloseTo(4_320_000, 3);
  await testInfo.attach('CAD measurements', {
    body: JSON.stringify(probe, null, 2),
    contentType: 'application/json',
  });
});

test('complete precise modelling, history, drawing, export and recovery workflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await rectangle(page);
  await extrude(page);
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await page.getByTestId('move-x').fill('2,4 m');
  await page.getByTestId('move-y').fill('20');
  await page.getByRole('button', { name: 'Vaihda etumerkki: Siirtymä · Y' }).click();
  await expect(page.getByTestId('move-y')).toHaveValue('-20');
  await page.getByRole('button', { name: 'Hyväksy', exact: true }).click();
  await expect(page.locator('.origin-readout')).toContainText('2 400');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.origin-readout')).toContainText('X 0');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.origin-readout')).toContainText('2 400');
  await page.getByRole('button', { name: 'Perspektiivi', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Rinnakkaisprojektio', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Näkymä: Edestä', exact: true }).press('Enter');
  const canvas = await page.getByTestId('viewport').boundingBox();
  await page.keyboard.press('v');
  await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await expect(page.locator('.selection-tag')).toHaveText('CAD-kappale');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByText('Yksittäinen kokonaismitta', { exact: true }).click();
  await page.getByRole('button', { name: 'Leveys', exact: true }).click();
  await expect(page.locator('.dimension-list')).toContainText('600');
  await page.getByRole('button', { name: 'Korkeus', exact: true }).click();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('drawing.png') });
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true }).click();
  const svg = await readFile((await (await svgDownload).path())!, 'utf8');
  expect(svg).toContain('width="297mm" height="210mm"');
  expect(svg).toContain('data-mm="600"');
  expect(svg).toContain('data-mm="18"');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  const file = await download,
    path = (await file.path())!;
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.bodies[0].feature).toEqual({
    type: 'rectangle-extrusion',
    width: 600,
    depth: 400,
    height: 18,
  });
  expect(saved.bodies[0].origin).toEqual([2400, -20, 0]);
  expect(saved.dimensions).toHaveLength(2);
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Uusi projekti', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Uusi projekti', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(0);
  await page.getByTestId('project-file').setInputFiles(path);
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await page.locator('.object-list .object-select').click();
  await expect(page.getByTestId('selected-height')).toContainText('18');
  await page.getByTestId('project-file').setInputFiles({
    name: 'invalid.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"nivo","version":999}'),
  });
  await expect(page.getByRole('alert')).toContainText('versio');
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('workflow.png') });
});

test('tablet drawing release accepts once, orientation change and recovery', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet');
  await ready(page);
  await page.getByRole('button', { name: 'Muodot', exact: true }).tap();
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).tap();
  await page.getByRole('button', { name: 'Näkymä: Ylhäältä', exact: true }).press('Enter');
  const viewport = await page.getByTestId('viewport').boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = viewport!.x + viewport!.width * 0.38,
    y = viewport!.y + viewport!.height * 0.4;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 100, y: y + 110 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anna paksuus', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anna paksuus', exact: true }).tap();
  await page.getByTestId('height-input').fill('18');
  await page.getByRole('button', { name: 'Hyväksy', exact: true }).tap();
  await expect(page.getByTestId('selected-height')).toContainText('18');
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.getByTestId('selected-height')).toContainText('18');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('tablet-portrait.png') });
});

test('example cabinet and visible invalid dimension reference after deletion', async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: 'Tai avaa esimerkkikaappi' }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('cabinet.png') });
  await page.locator('.object-list .object-select').filter({ hasText: 'Kansi' }).click();
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByText('Yksittäinen kokonaismitta', { exact: true }).click();
  await page.getByRole('button', { name: 'Leveys', exact: true }).click();
  await expect(page.locator('.dimension-list')).toContainText('564');
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await page.getByRole('button', { name: 'Poista kappale', exact: true }).click();
  await expect(page.locator('.dimension-list')).toContainText('Viite puuttuu');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.dimension-list')).toContainText('564');
  await expect(page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true })).toBeEnabled();
});
