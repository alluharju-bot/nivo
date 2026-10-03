import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, save } from './helpers';

test('finishing an image import cannot roll back a newer placement', async ({ page }) => {
  const body = makeBody(200, 100, 40);
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.locator('.model-materials > summary').click();
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#88bb44';
    ctx.fillRect(0, 0, 16, 16);
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      const image = await original(...args);
      await new Promise<void>((resolve) => {
        (window as any).finishMaterialDecode = resolve;
      });
      return image;
    }) as typeof createImageBitmap;
    return c.toDataURL();
  });
  await page.getByTestId('model-texture-file').setInputFiles({
    name: 'color.png',
    mimeType: 'image/png',
    buffer: Buffer.from(url.split(',')[1], 'base64'),
  });
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishMaterialDecode))
    .toBe('function');
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await page.getByTestId('move-x').fill('123');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.evaluate(() => (window as any).finishMaterialDecode());
  await expect.poll(async () => (await save(page)).bodies[0].appearance?.assetId).toBeTruthy();
  const project = await save(page);
  expect(project.bodies[0].origin).toEqual([123, 0, 0]);
  expect(project.assets![project.bodies[0].appearance!.assetId!].name).toBe('color.png');
});
