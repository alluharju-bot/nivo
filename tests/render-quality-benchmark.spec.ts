import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { ready } from './helpers';

// Private, opt-in and serial. Camera/model paths and images never enter git.
test.use({ deviceScaleFactor: 1, viewport: { width: 1100, height: 760 } });
test('compare fixed-camera quality at equal time and 500 samples', async ({ page }, info) => {
  test.skip(!process.env.NIVO_QUALITY_BENCHMARK, 'Explicit private GPU audit only.');
  test.setTimeout(1200000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const project = JSON.parse(await readFile(process.env.NIVO_AUDIT_MODEL!, 'utf8'));
  const camera = JSON.parse(await readFile(process.env.NIVO_TRACE_VIEW!, 'utf8'));
  await page.getByTestId('project-file').setInputFiles({
    name: 'quality-audit.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...project, renderViews: [camera] })),
  });
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')), {
      timeout: 90000,
    })
    .toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  await page.locator('.saved-render-views > summary').click();
  await page.getByRole('button', { name: `Katso: ${camera.name}`, exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await canvas.screenshot({ path: info.outputPath('preview.png') });
  await canvas.evaluate((el) => {
    const data = (el as HTMLElement).dataset;
    const began = performance.now();
    const metrics = { firstImageMs: 0, resets: [] as string[] };
    let cleared = false,
      lastReset = '';
    const observer = new MutationObserver(() => {
      if (data.traceOpacity === '0') cleared = true;
      if (cleared && !metrics.firstImageMs && data.traceOpacity === '1')
        metrics.firstImageMs = performance.now() - began;
      if (metrics.firstImageMs && lastReset && data.traceReset !== lastReset)
        metrics.resets.push(data.traceResetReason ?? 'unknown');
      lastReset = data.traceReset ?? '';
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-trace-opacity', 'data-trace-reset'],
    });
    (window as unknown as { stopQualityAudit: () => typeof metrics }).stopQualityAudit = () => {
      observer.disconnect();
      return metrics;
    };
  });
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('0');
  const started = Date.now();
  const checkpoints: unknown[] = [];
  for (const checkpoint of [{ seconds: 60 }, { samples: 64 }, { samples: 256 }, { samples: 500 }]) {
    await expect
      .poll(
        async () => {
          if ('seconds' in checkpoint) return (Date.now() - started) / 1000 >= checkpoint.seconds!;
          const d = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
          return (
            Number(d.traceResolutionStep) === Number(d.traceResolutionSteps) - 1 &&
            Number(d.traceSamples) >= checkpoint.samples!
          );
        },
        { timeout: 900000, intervals: [500] },
      )
      .toBe(true);
    const name = 'seconds' in checkpoint ? '60s' : `${checkpoint.samples}spp`;
    checkpoints.push({
      checkpoint,
      ms: Date.now() - started,
      data: await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset })),
    });
    await canvas.screenshot({ path: info.outputPath(`${name}.png`) });
    await writeFile(info.outputPath('partial.json'), JSON.stringify(checkpoints, null, 2));
    console.log(
      JSON.stringify({
        checkpoint: name,
        elapsedMs: Date.now() - started,
        samples: await canvas.getAttribute('data-trace-samples'),
        gpuMs: await canvas.getAttribute('data-trace-gpu-ms'),
      }),
    );
  }
  const telemetry = await page.evaluate(() =>
    (
      window as unknown as { stopQualityAudit: () => { firstImageMs: number; resets: string[] } }
    ).stopQualityAudit(),
  );
  expect(telemetry.resets).toEqual([]);
  const before = await canvas.getAttribute('data-camera');
  const box = (await canvas.boundingBox())!;
  const t = Date.now();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.5 + 45, box.y + box.height * 0.5 + 10, { steps: 4 });
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'true');
  expect(await canvas.getAttribute('data-camera')).not.toBe(before);
  const navigationMs = Date.now() - t;
  await page.mouse.up({ button: 'right' });
  await writeFile(
    info.outputPath('quality.json'),
    JSON.stringify(
      { label: process.env.NIVO_QUALITY_BENCHMARK, checkpoints, navigationMs, telemetry, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
