import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

// Opt-in timing audit: same model, camera, sample target and DPR across commits.
// Keep private models and screenshots out of published benchmark results.
test.use({ deviceScaleFactor: 2 });
test('measure complete refinement without concurrent GPU tests', async ({ page }, info) => {
  test.skip(!process.env.NIVO_TRACE_BENCHMARK, 'Run explicitly for before/after measurements.');
  test.setTimeout(600000);
  const camera = process.env.NIVO_TRACE_VIEW
    ? JSON.parse(await readFile(process.env.NIVO_TRACE_VIEW, 'utf8'))
    : undefined;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(
    page,
    process.env.NIVO_AUDIT_MODEL
      ? []
      : [{ ...makeBody(400, 300, 40), appearance: defaultAppearance('pbr-coated_pine') }],
  );
  if (process.env.NIVO_AUDIT_MODEL) {
    const project = JSON.parse(await readFile(process.env.NIVO_AUDIT_MODEL, 'utf8'));
    await page.getByTestId('project-file').setInputFiles({
      name: 'render-audit.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ ...project, ...(camera ? { renderViews: [camera] } : {}) }),
      ),
    });
    await expect
      .poll(
        async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')),
        { timeout: 90000 },
      )
      .toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  if (camera) {
    await page.locator('.saved-render-views > summary').click();
    await page.getByRole('button', { name: `Katso: ${camera.name}`, exact: true }).click();
    await expect
      .poll(
        async () =>
          JSON.parse((await page.getByTestId('render-canvas').getAttribute('data-camera'))!)
            .focalLength,
      )
      .toBeCloseTo(camera.focalLength);
  }
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('64');
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  await page
    .getByTestId('render-canvas')
    .screenshot({ path: info.outputPath('benchmark-view.png') });
  const runs = [];
  const repeats = Number(process.env.NIVO_TRACE_RUNS ?? 3);
  expect(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10).toBe(true);
  for (let run = 0; run < repeats; run++) {
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-testid="render-canvas"]') as HTMLCanvasElement;
      const status = () =>
        document.querySelector('[data-testid="trace-status"]')?.textContent ?? '';
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Tarkentuva',
      )!;
      const start = performance.now();
      let last = start,
        firstImageMs = 0,
        cleared = false,
        lastReset = '';
      const intervals: number[] = [];
      const stages: { size: string; atMs: number }[] = [];
      const resets: { reason?: string; atMs: number }[] = [];
      const input: { type: string; atMs: number }[] = [];
      const events = ['pointerdown', 'wheel', 'keydown', 'resize', 'blur', 'focus'];
      const record = (event: Event) =>
        input.push({ type: event.type, atMs: performance.now() - start });
      events.forEach((type) => window.addEventListener(type, record, true));
      button.click();
      while (!status().includes('Tavoite saavutettu')) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const now = performance.now();
        intervals.push(now - last);
        last = now;
        if (canvas.dataset.traceOpacity === '0') cleared = true;
        if (cleared && !firstImageMs && canvas.dataset.traceOpacity === '1')
          firstImageMs = now - start;
        const reset = canvas.dataset.traceReset ?? '';
        if (lastReset && reset !== lastReset && firstImageMs)
          resets.push({ reason: canvas.dataset.traceResetReason, atMs: now - start });
        lastReset = reset;
        const size = canvas.dataset.tracePresentedSize;
        if (cleared && canvas.dataset.traceOpacity === '1' && size && stages.at(-1)?.size !== size)
          stages.push({ size, atMs: now - start });
        if (now - start > 300000) throw new Error('Refinement benchmark timed out');
        if (status().includes('virhe')) throw new Error(status());
      }
      intervals.sort((a, b) => a - b);
      events.forEach((type) => window.removeEventListener(type, record, true));
      return {
        firstImageMs,
        completeMs: performance.now() - start,
        frameP95Ms: intervals[Math.floor(intervals.length * 0.95)],
        frameMaxMs: intervals.at(-1),
        size: canvas.dataset.traceSize,
        stages,
        resets,
        input,
      };
    });
    runs.push(result);
    console.log(JSON.stringify({ run: run + 1, ...result }));
    expect(result.resets, 'Do not compare a render that was restarted mid-measurement').toEqual([]);
    if (run === repeats - 1)
      await page
        .getByTestId('render-canvas')
        .screenshot({ path: info.outputPath('benchmark-refined.png') });
    await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  }
  const result = {
    label: process.env.NIVO_TRACE_BENCHMARK,
    model: process.env.NIVO_AUDIT_MODEL
      ? camera
        ? 'private-176-parts-interior'
        : 'private-176-parts-exterior'
      : 'single-pbr-board',
    dpr: 2,
    samples: 64,
    runs,
    errors,
  };
  console.log(JSON.stringify(result));
  await writeFile(info.outputPath('refinement-timing.json'), JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
});
