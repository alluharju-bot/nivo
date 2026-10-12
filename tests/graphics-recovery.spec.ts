import { expect, test } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

test('a failed graphics startup can be retried without reloading or clearing the project', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const state = window as unknown as { failGraphics: boolean };
    state.failGraphics = true;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (args[0] === 'webgl2' && state.failGraphics) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto(process.env.NIVO_BASE_PATH ?? '/');
  await expect(page.getByRole('alert')).toContainText('grafiikkaa ei voitu käynnistää');
  await page.evaluate(() => {
    (window as unknown as { failGraphics: boolean }).failGraphics = false;
  });
  await page.getByRole('button', { name: 'Yritä 3D-näkymää uudelleen' }).click();
  await expect(page.getByTestId('viewport')).toHaveCount(1);
  await expect(page.locator('.viewport-error')).toHaveCount(0);
  await expect(page.locator('.model-markups')).toHaveCount(1);
});

test('model and render views recover a lost GPU context, retaining geometry and the render camera', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  for (const mode of ['viewport', 'render-canvas']) {
    if (mode === 'render-canvas') {
      await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
      await page.getByRole('button', { name: 'Kuva', exact: true }).click();
      await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
      await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
      await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
        timeout: 120000,
      });
    }
    const canvas = page.getByTestId(mode);
    const camera = await canvas.getAttribute('data-camera');
    await canvas.evaluate((element) => {
      const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_lose_context')!;
      (window as unknown as { restoreGraphics: () => void }).restoreGraphics = () =>
        extension.restoreContext();
      extension.loseContext();
    });
    await expect(page.getByRole('alert')).toContainText('Yhteys näytönohjaimeen katkesi');
    await page.evaluate(() =>
      (window as unknown as { restoreGraphics: () => void }).restoreGraphics(),
    );
    await expect(page.locator('.viewport-error')).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
    if (mode === 'render-canvas') {
      await expect(page.getByRole('button', { name: 'Nopea', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const before = JSON.parse(camera!),
        after = JSON.parse((await canvas.getAttribute('data-camera'))!);
      after.position.forEach((n: number, i: number) =>
        expect(n).toBeCloseTo(before.position[i], 8),
      );
      after.target.forEach((n: number, i: number) => expect(n).toBeCloseTo(before.target[i], 8));
      await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
    }
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  }
  expect((await save(page)).bodies[0].id).toBe(body.id);
  expect(errors).toEqual([]);
});
