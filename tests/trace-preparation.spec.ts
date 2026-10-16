import { expect, test } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';

test('a pending studio image can be cancelled, times out clearly and recovers when it arrives', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/environment.hdr', async (route) => {
    await held;
    await route.continue();
  });
  await ready(page, [makeBody()]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const status = page.getByTestId('trace-status');
  await expect(status).toContainText('Ladataan materiaalikuvia');
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  await expect(status).toHaveCount(0);
  await page.clock.install();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.clock.runFor(30_100);
  await expect(status).toContainText('lataus ei valmistunut');
  await expect(page.getByRole('button', { name: 'Tarkentuva', exact: true })).toBeEnabled();
  release();
  await page.clock.resume();
  await expect(page.getByTestId('render-canvas')).toHaveAttribute(
    'data-environment',
    'studio-hdri',
  );
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 60000 });
});

test('a stalled driver compile does not enqueue empty GPU batches and can resume after a clear error', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const state = window as unknown as { holdCompile: boolean };
    state.holdCompile = true;
    const original = WebGL2RenderingContext.prototype.getProgramParameter;
    WebGL2RenderingContext.prototype.getProgramParameter = function (program, pname) {
      // KHR_parallel_shader_compile.COMPLETION_STATUS_KHR: emulate a driver
      // that never reports completion, without creating real GPU overload.
      return pname === 0x91b1 && state.holdCompile ? false : original.call(this, program, pname);
    };
  });
  await ready(page, [makeBody()]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const canvas = page.getByTestId('render-canvas'),
    status = page.getByTestId('trace-status');
  await expect(canvas).toHaveAttribute('data-trace-phase', 'compiling');
  await expect(status).toContainText('renderiohjelmaa');
  expect(await canvas.getAttribute('data-trace-batch-tiles')).toBeNull();
  await page.clock.install();
  await page.clock.runFor(61_100);
  await expect(status).toContainText('valmistelu ei valmistunut');
  await expect(canvas).toHaveAttribute('data-trace-phase', 'error');
  expect(await canvas.getAttribute('data-trace-batch-tiles')).toBeNull();
  await page.evaluate(() => {
    (window as unknown as { holdCompile: boolean }).holdCompile = false;
  });
  await page.clock.resume();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 60000 });
  expect(errors).toEqual([]);
});
