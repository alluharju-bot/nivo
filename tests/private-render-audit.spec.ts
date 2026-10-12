import { test, expect } from '@playwright/test';
import { ready } from './helpers';

test.use({ deviceScaleFactor: 2 });
const modelPath = process.env.NIVO_AUDIT_MODEL;
test('private large model refines at Retina resolution, resets promptly on navigation and releases its context', async ({
  page,
}, info) => {
  test.skip(!modelPath, 'Private projects remain local and are never included in the repository.');
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  await page.getByTestId('project-file').setInputFiles(modelPath!);
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')), {
      timeout: 90000,
    })
    .toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 150000,
  });
  const [w, h] = (await canvas.getAttribute('data-trace-size'))!.split('x').map(Number);
  expect(w * h).toBeLessThanOrEqual(3_000_000);
  expect(w).toBeGreaterThan(640);
  await canvas.screenshot({ path: info.outputPath('private-refinement.png') });
  const box = (await canvas.boundingBox())!;
  const before = await canvas.getAttribute('data-camera');
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const started = Date.now();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.6 + 60, box.y + box.height * 0.5 + 20, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'true');
  expect(await canvas.getAttribute('data-camera')).not.toBe(before);
  await expect(canvas).toHaveAttribute('data-trace-samples', '0');
  const navigationMs = Date.now() - started;
  await page.mouse.up({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-trace-resolution-step', '0');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-trace-samples')))
    .toBeGreaterThan(0);
  await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2')!;
    (window as unknown as { oldContextLost: () => boolean }).oldContextLost = () =>
      gl.isContextLost();
  });
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { oldContextLost: () => boolean }).oldContextLost(),
      ),
    )
    .toBe(true);
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')))
    .toBeGreaterThan(100);
  console.log(JSON.stringify({ preview: `${w}x${h}`, navigationMs, errors }));
  expect(errors).toEqual([]);
});
