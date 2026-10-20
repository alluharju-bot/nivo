import { test, expect } from '@playwright/test';
import { ready, view } from './helpers';
import { makeBody, type Guide } from '../src/model/project';

test('push/pull dragging reuses face shader programs and cancels cleanly', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { extrusionCompiles: number };
    state.extrusionCompiles = 0;
    const compile = WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      state.extrusionCompiles++;
      return compile.call(this, shader);
    };
  });
  const body = makeBody(1200, 800, 100);
  await ready(page, [body]);
  const at = await view(page, [body]);
  const start = at(600, 400, 100);
  await page.keyboard.press('e');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y - 60, { steps: 5 });
  await expect(page.getByTestId('height-input')).toBeVisible();
  await page.waitForTimeout(200);
  const compiles = () =>
    page.evaluate(() => (window as unknown as { extrusionCompiles: number }).extrusionCompiles);
  const before = await compiles();
  for (let i = 0; i < 20; i++) await page.mouse.move(start.x, start.y - 70 - i * 2);
  await page.waitForTimeout(100);
  expect((await compiles()) - before).toBe(0);
  await expect(page.getByTestId('extrusion-delta')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('extrusion-delta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeDisabled();
});

for (const count of [0, 12])
  test(`measurement dragging retains labels and shader programs (${count} saved guides)`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const state = window as unknown as { measurementCompiles: number };
      state.measurementCompiles = 0;
      const compile = WebGL2RenderingContext.prototype.compileShader;
      WebGL2RenderingContext.prototype.compileShader = function (shader) {
        state.measurementCompiles++;
        return compile.call(this, shader);
      };
    });
    const floor = makeBody(1200, 800, 100);
    const guides: Guide[] = Array.from({ length: count }, (_, i) => ({
      id: `saved-${i}`,
      mode: 'guide',
      plane: 'XY',
      angle: 0,
      length: 1200,
      anchor: { point: [0, 30 + i * 30, 100] },
      direction: [1, 0, 0],
    }));
    await ready(page, [floor], guides);
    const p = await view(page, [floor]);
    const saved = count
      ? await page.locator('.guide-label[data-guide-id="saved-0"]').elementHandle()
      : undefined;
    await page.keyboard.press('t');
    const start = p(850, 0, 100),
      end = p(850, 600, 100);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await expect(page.getByTestId('guide-label')).toHaveCount(count + 1);
    await expect(page.getByTestId('guide-length')).toHaveValue('600');
    const draft = await page.getByTestId('guide-label').last().elementHandle();
    await page.waitForTimeout(200);
    const compiles = () =>
      page.evaluate(
        () => (window as unknown as { measurementCompiles: number }).measurementCompiles,
      );
    const before = await compiles();
    for (let i = 0; i < 20; i++) {
      const at = p(850, 420 + i * 10, 100);
      await page.mouse.move(at.x, at.y);
    }
    await expect(page.getByTestId('guide-length')).toHaveValue('610');
    expect(await draft!.evaluate((el) => el.isConnected)).toBe(true);
    if (saved) expect(await saved.evaluate((el) => el.isConnected)).toBe(true);
    expect((await compiles()) - before).toBe(0);
    await page.mouse.up();
    await expect(page.getByTestId('guide-label')).toHaveCount(count + 1);
    expect(await draft!.evaluate((el) => el.isConnected)).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await expect(page.getByTestId('guide-label')).toHaveCount(count);
    expect(await draft!.evaluate((el) => el.isConnected)).toBe(false);
    if (saved) expect(await saved.evaluate((el) => el.isConnected)).toBe(true);
  });
