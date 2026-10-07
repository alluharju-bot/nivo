import { expect, test } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';

test('refinement starts at rest, switches to full resolution, and recovers a cancelled camera drag', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'GPU lifecycle is tested once; touch navigation has separate coverage.',
  );
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [{ ...makeBody(400, 300, 40), appearance: defaultAppearance('pine') }]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const quick = await canvas.screenshot();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const status = page.getByTestId('trace-status');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  const draftSize = await canvas.getAttribute('data-trace-size');
  expect((await canvas.screenshot()).equals(quick)).toBe(false);
  await page.getByLabel('Esikatselun tarkkuus', { exact: true }).selectOption('full');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  const fullSize = await canvas.evaluate(
    (el) => `${(el as HTMLCanvasElement).width}x${(el as HTMLCanvasElement).height}`,
  );
  await expect(canvas).toHaveAttribute('data-trace-size', fullSize);
  expect(fullSize).not.toBe(draftSize);
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  await page.getByLabel('Esikatselun tarkkuus', { exact: true }).selectOption('draft');
  await expect(status).toContainText('Tavoite saavutettu');
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
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
  // Losing focus can swallow pointerup. It must not require another orbit to resume.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'false');
  await expect(status).toContainText('Tavoite saavutettu');
  await page.mouse.up({ button: 'right' });
  // A normal release may also lose capture; the gate must stay open.
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'false');
  await page.screenshot({ path: info.outputPath('refined-at-rest.png') });
  expect(errors).toEqual([]);
});
