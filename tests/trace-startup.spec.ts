import { expect, test } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';

test('refinement starts at rest, automatically increases resolution, and recovers a cancelled camera drag', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'GPU lifecycle is tested once; touch navigation has separate coverage.',
  );
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const state = window as unknown as { traceProgramLinks: number };
    state.traceProgramLinks = 0;
    const original = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (program) {
      const sources = (this.getAttachedShaders(program) ?? []).map(
        (shader) => this.getShaderSource(shader) ?? '',
      );
      if (sources.some((s) => s.slice(s.lastIndexOf('void main() {')).includes('nivoTracePath();')))
        state.traceProgramLinks++;
      original.call(this, program);
    };
  });
  await ready(page, [{ ...makeBody(400, 300, 40), appearance: defaultAppearance('pine') }]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await canvas.evaluate((el) => {
    const transitions: { size: string; weight: number; samples: number }[] = [];
    (window as unknown as { traceTransitions: typeof transitions }).traceTransitions = transitions;
    const observer = new MutationObserver(() => {
      const data = (el as HTMLElement).dataset;
      if (data.traceOpacity === '1' && Number(data.traceHistoryWeight) > 0)
        transitions.push({
          size: data.tracePresentedSize!,
          weight: Number(data.traceHistoryWeight),
          samples: Number(data.traceSamples),
        });
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-trace-history-weight'] });
  });
  const quick = await canvas.screenshot();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const status = page.getByTestId('trace-status');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  // Preparation must compile the actual float-target variant. Compiling for
  // the canvas caused an unguarded second compile inside the first draw.
  expect(
    await page.evaluate(
      () => (window as unknown as { traceProgramLinks: number }).traceProgramLinks,
    ),
  ).toBe(1);
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  await expect(canvas).toHaveAttribute('data-trace-history-weight', '0');
  const transitions = await page.evaluate(
    () =>
      (
        window as unknown as {
          traceTransitions: { size: string; weight: number; samples: number }[];
        }
      ).traceTransitions,
  );
  expect(transitions.length).toBeGreaterThan(0);
  expect(transitions.every((s) => s.weight > 0 && s.weight < 1 && s.samples < 8)).toBe(true);
  expect((await canvas.screenshot()).equals(quick)).toBe(false);
  const fullSize = await canvas.evaluate(
    (el) => `${(el as HTMLCanvasElement).width}x${(el as HTMLCanvasElement).height}`,
  );
  await expect(canvas).toHaveAttribute('data-trace-size', fullSize);
  expect(Number(await canvas.getAttribute('data-trace-resolution-step'))).toBeGreaterThan(0);
  await expect(page.getByLabel('Esikatselun tarkkuus', { exact: true })).toHaveCount(0);
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Tauota renderöinti', exact: true }).click();
  await expect(status).toContainText('Tauolla');
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect(status).toContainText('Tavoite saavutettu');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 15);
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'true');
  await expect(canvas).toHaveAttribute('data-trace-samples', '0');
  await expect(canvas).toHaveAttribute('data-trace-history-weight', '0');
  // Losing focus can swallow pointerup. It must not require another orbit to resume.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'false');
  await expect(canvas).toHaveAttribute('data-trace-resolution-step', '0');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  await page.mouse.up({ button: 'right' });
  // A normal release may also lose capture; the gate must stay open.
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'false');
  await page.screenshot({ path: info.outputPath('refined-at-rest.png') });
  expect(errors).toEqual([]);
});
