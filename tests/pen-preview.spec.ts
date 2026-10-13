import { expect, test } from '@playwright/test';
import { makeBody, type Guide } from '../src/model/project';
import { ready, view, click } from './helpers';

test('moving the pen keeps saved guide labels alive and snaps to their exact line', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 20);
  const guide: Guide = {
    id: 'reference',
    mode: 'free',
    plane: 'XY',
    angle: 90,
    anchor: { point: [100, 0, 20] },
    direction: [0, 1, 0],
    length: 400,
  };
  await ready(page, [floor], [guide]);
  const point = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, point(50, 150, 20));
  const canvas = page.getByTestId('viewport');
  const label = await page
    .locator('[data-testid="guide-label"][data-guide-id="reference"]')
    .elementHandle();
  expect(label).toBeTruthy();
  for (const y of [210, 260, 290]) {
    await page.mouse.move(point(100, y, 20).x, point(100, y, 20).y);
    await expect(canvas).toHaveAttribute('data-snap-key', /reference/);
    await expect
      .poll(async () => {
        const p = JSON.parse((await canvas.getAttribute('data-pen-hover')) || 'null');
        return p ? Math.abs(p[0] - 100) + Math.abs(p[2] - 20) : Infinity;
      })
      .toBeLessThan(0.0001);
    // A pointer move must not recreate all saved guides, their labels and GPU resources.
    expect(await label!.evaluate((node) => node.isConnected)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('pen-preview-guides.png') });
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-pen-points', '[]');
  await expect(page.locator('[data-testid="guide-label"][data-guide-id="reference"]')).toHaveText(
    '400 mm',
  );
});
