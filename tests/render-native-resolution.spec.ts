import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';
import { readFile } from 'node:fs/promises';
import { installGpuAllocationProbe } from './fixtures/gpu-allocation-probe';

test.use({
  viewport: process.env.NIVO_NATIVE_4K
    ? { width: 2210, height: 1177 }
    : { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
test('Retina rendering reaches native detail and keeps navigation, filter changes and saved image working', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Native 4K uses the desktop memory budget.');
  test.setTimeout(240000);
  await page.addInitScript(installGpuAllocationProbe);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, [
    { ...makeBody(400, 200, 50), appearance: defaultAppearance('pbr-oak_veneer_01') },
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const canvas = page.getByTestId('render-canvas');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 150000,
  });
  const dimensions = await canvas.evaluate((el) => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));
  expect(dimensions.width * dimensions.height).toBeGreaterThan(3_000_000);
  await expect(canvas).toHaveAttribute(
    'data-trace-size',
    `${dimensions.width}x${dimensions.height}`,
  );
  await expect(canvas).toHaveAttribute('data-trace-resolution-limited', 'false');
  const reset = await canvas.getAttribute('data-trace-reset');
  await page.getByLabel('Kohinan pehmennys', { exact: true }).uncheck();
  await canvas.screenshot({ path: info.outputPath('native-raw.png') });
  await page.getByLabel('Kohinan pehmennys', { exact: true }).check();
  await canvas.screenshot({ path: info.outputPath('native-filtered.png') });
  expect(await canvas.getAttribute('data-trace-reset')).toBe(reset);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tarkentuva kuva PNG', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  expect(png.readUInt32BE(16)).toBe(dimensions.width);
  expect(png.readUInt32BE(20)).toBe(dimensions.height);
  const before = await canvas.getAttribute('data-camera'),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.5 + 35, box.y + box.height * 0.5 + 10, { steps: 4 });
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'true');
  expect(await canvas.getAttribute('data-camera')).not.toBe(before);
  await expect(canvas).toHaveAttribute('data-trace-samples', '0');
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 150000,
  });
  expect(errors).toEqual([]);
  const allocations = await page.evaluate(() =>
    (
      window as unknown as { renderGpuAllocations: () => { bytes: number; peak: number } }
    ).renderGpuAllocations(),
  );
  expect(allocations.peak).toBeGreaterThan(dimensions.width * dimensions.height * 48);
  expect(allocations.peak).toBeLessThan(
    Number(await canvas.getAttribute('data-trace-target-budget-bytes')) +
      Number(await canvas.getAttribute('data-trace-texture-bytes')),
  );
  console.log(
    JSON.stringify({
      dimensions,
      allocations,
      trace: await canvas.evaluate((el) =>
        Object.fromEntries(
          Object.entries((el as HTMLElement).dataset).filter(([k]) => k.startsWith('trace')),
        ),
      ),
    }),
  );
});
