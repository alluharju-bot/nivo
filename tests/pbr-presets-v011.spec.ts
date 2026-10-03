import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { makeBody } from '../src/model/project';
import { ready } from './helpers';

test('wood, melamine and cabinet board stay textured and colored when changed during progressive rendering', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await ready(page, [makeBody(300, 200, 300)]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  for (const preset of ['oak', 'melamine-oak', 'plywood-birch']) {
    await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
    await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption(preset);
    await expect(page.getByRole('combobox', { name: 'Materiaali', exact: true })).toHaveValue(
      preset,
    );
    await page.getByRole('button', { name: 'Kuva', exact: true }).click();
    if (preset === 'oak') {
      await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
      await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
    }
    await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
      timeout: 90_000,
    });
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tallenna tarkentuva kuva PNG', exact: true }).click();
    const file = await pending;
    const png = decode(await readFile((await file.path())!));
    let warm = 0;
    for (let i = 0; i < png.data.length; i += png.channels) {
      if (png.data[i] > 90 && png.data[i] > png.data[i + 2] * 1.07) warm++;
    }
    expect(warm).toBeGreaterThan(2000);
    await file.saveAs(info.outputPath(`${preset}.png`));
  }
  expect(errors).toEqual([]);
});
