import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

test('captures the current modeling view as PNG without changing the camera or project', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = { ...makeBody(600, 400, 240, [0, 0, 0], 'Kuvattava osa'), color: '#b34725' };
  await ready(
    page,
    [body],
    [
      {
        id: 'line',
        mode: 'free',
        anchor: { point: [0, 200, 240] },
        endAnchor: { point: [600, 200, 240] },
        length: 600,
        plane: 'XY',
        angle: 0,
      },
    ],
  );
  await page.getByTestId(`body-${body.id}`).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Mitat ja mallinnus$/ })
    .click();
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(3);
  await expect(page.getByTestId('guide-label')).toContainText('600 mm');
  const canvas = page.getByTestId('viewport');
  const before = await save(page);
  const camera = await canvas.getAttribute('data-camera');
  const size = await canvas.evaluate((c) => ({
    width: (c as HTMLCanvasElement).width,
    height: (c as HTMLCanvasElement).height,
  }));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }).click();
  const image = await download;
  expect(image.suggestedFilename()).toMatch(/-nakyma\.png$/);
  const png = await readFile((await image.path())!);
  expect(png.readUInt32BE(16)).toBe(size.width);
  expect(png.readUInt32BE(20)).toBe(size.height);
  expect(png.length).toBeGreaterThan(5000);
  await image.saveAs(info.outputPath('model-view.png'));
  const colors = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let colored = 0,
      transparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) >
        35
      )
        colored++;
      if (!data[i + 3]) transparent++;
    }
    return { colored, transparent };
  }, png.toString('base64'));
  expect(colors.colored).toBeGreaterThan(1000);
  expect(colors.transparent).toBe(0);
  await expect(canvas).toHaveAttribute('data-camera', camera!);
  await expect(canvas).toHaveAttribute('data-selection-kind', 'object');
  expect(await save(page)).toEqual(before);
  // Saved dimensions are part of the picture; the global visibility switch applies to exports too.
  await page.getByRole('button', { name: 'Piilota kaikki mittaviivat', exact: true }).click();
  const hiddenDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }).click();
  const hidden = await hiddenDownload;
  const hiddenPng = await readFile((await hidden.path())!);
  expect(hiddenPng.equals(png)).toBe(false);
  await hidden.saveAs(info.outputPath('model-without-dimensions.png'));
  await expect(
    page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
