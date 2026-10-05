import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { materialPresets, defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

test('all 53 local material presets render together without GPU errors', async ({ page }, info) => {
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
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByTestId('render-canvas')).toHaveAttribute(
    'data-body-count',
    String(materialPresets.length),
  );
  await page.screenshot({ path: info.outputPath('material-catalog.png') });
  expect(errors).toEqual([]);
});
