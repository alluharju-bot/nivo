import { test, expect } from '@playwright/test';
import { ready } from './helpers';
import { readFile } from 'node:fs/promises';

test.use({ deviceScaleFactor: 2 });
const modelPath = process.env.NIVO_AUDIT_MODEL;
test('private large model refines at Retina resolution, resets promptly on navigation and releases its context', async ({
  page,
}, info) => {
  test.skip(!modelPath, 'Private projects remain local and are never included in the repository.');
  const targetSamples = process.env.NIVO_AUDIT_SAMPLES ?? '8';
  const renderTimeout = targetSamples === '8' ? 150000 : 480000;
  test.setTimeout(renderTimeout + 120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  const camera = process.env.NIVO_TRACE_VIEW
    ? JSON.parse(await readFile(process.env.NIVO_TRACE_VIEW, 'utf8'))
    : undefined;
  const project = JSON.parse(await readFile(modelPath!, 'utf8'));
  await page.getByTestId('project-file').setInputFiles({
    name: 'private-render-audit.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...project, ...(camera ? { renderViews: [camera] } : {}) }),
    ),
  });
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')), {
      timeout: 90000,
    })
    .toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  if (camera) {
    await page.getByRole('button', { name: 'Nopea', exact: true }).click();
    await page.locator('.saved-render-views > summary').click();
    await page.getByRole('button', { name: `Katso: ${camera.name}`, exact: true }).click();
    await canvas.screenshot({ path: info.outputPath('private-preview.png') });
    await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  }
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption(targetSamples);
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: renderTimeout,
  });
  const [w, h] = (await canvas.getAttribute('data-trace-size'))!.split('x').map(Number);
  expect(
    Number(await canvas.getAttribute('data-trace-estimated-target-bytes')),
  ).toBeLessThanOrEqual(Number(await canvas.getAttribute('data-trace-target-budget-bytes')));
  if ((await canvas.getAttribute('data-trace-resolution-limited')) === 'false')
    expect(`${w}x${h}`).toBe(await canvas.getAttribute('data-trace-native-size'));
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
