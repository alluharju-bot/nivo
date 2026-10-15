import { test, expect } from '@playwright/test';
import { freshProject, makeBody } from '../src/model/project';
import { materialPresets, defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

test('all local material presets render together without GPU errors', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const bodies = materialPresets.map((preset, i) => ({
    ...makeBody(110, 110, 40, [(i % 6) * 140, Math.floor(i / 6) * 140, 0], preset.name),
    color: preset.color,
    appearance: defaultAppearance(preset.id),
  }));
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'catalog.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies })),
  });
  // This deliberately loads the entire PBR/procedural catalog at once, including
  // first-use texture conversion and shader compilation on a cold browser.
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(bodies.length),
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByTestId('render-canvas')).toHaveAttribute(
    'data-body-count',
    String(materialPresets.length),
  );
  await page.screenshot({ path: info.outputPath('material-catalog.png') });
  expect(errors).toEqual([]);
});
