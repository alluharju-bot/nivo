import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { cabinetProject, makeBody } from '../src/model/project';
import { ready, save } from './helpers';

test('render materials and lighting persist without changing geometry or Hold', async ({
  page,
}) => {
  const base = { ...makeBody(300, 200, 40, [0, 0, 0], 'Levy'), locked: true };
  const hidden = { ...makeBody(40, 40, 40, [400, 0, 0]), hidden: true };
  const construction = { ...makeBody(40, 40, 40), purpose: 'construction' as const };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page, [base, hidden, construction]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-body-count', '1');
  await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption('wood');
  await expect(page.getByRole('combobox', { name: 'Materiaali', exact: true })).toHaveValue('wood');
  await page.getByRole('button', { name: 'Väri: Terrakotta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Väri: Terrakotta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Valo', exact: true }).click();
  await page.getByRole('combobox', { name: 'Valaistus', exact: true }).selectOption('warm');
  await expect(page.getByRole('combobox', { name: 'Valaistus', exact: true })).toHaveValue('warm');
  await page.getByRole('checkbox', { name: 'Varjot', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Varjot', exact: true })).not.toBeChecked();
  const exposure = page.getByRole('slider', { name: 'Valotus', exact: true });
  await exposure.focus();
  await exposure.press('ArrowRight');
  await expect(exposure).toHaveValue('1.1');
  const result = await save(page);
  expect(result.bodies[0]).toEqual({ ...base, material: 'wood', color: '#bc8874' });
  expect(result.bodies.slice(1)).toEqual([hidden, construction]);
  expect(result.settings.render).toEqual({ environment: 'warm', exposure: 1.1, shadows: false });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(exposure).toHaveValue('1');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(exposure).toHaveValue('1.1');
  // Modeling shortcuts must not modify the scene in presentation mode.
  await page.getByRole('button', { name: 'Sovita malli', exact: true }).click();
  await page.keyboard.press('e');
  await page.keyboard.press('Delete');
  expect((await save(page)).bodies).toEqual(result.bodies);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Renderöi', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Materiaali', exact: true })).toHaveValue('wood');
  await page.getByRole('button', { name: 'Valo', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Valaistus', exact: true })).toHaveValue('warm');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('render-canvas')).toHaveCount(0);
  await expect(page.getByTestId('viewport')).toBeVisible();
  expect(errors).toEqual([]);
});

test('studio cabinet exports the visible camera as a full resolution PNG', async ({
  page,
}, info) => {
  const parts = cabinetProject().bodies.map((body, i) => ({
    ...body,
    material: 'wood' as const,
    color: i === 5 ? '#596c61' : '#d8c8a7',
  }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page, parts);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-body-count', String(parts.length));
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('combobox', { name: 'Kuvan leveys', exact: true }).selectOption('1600');
  await page.screenshot({ path: info.outputPath('studio-render.png') });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna PNG', exact: true }).click();
  const download = await pending;
  await download.saveAs(info.outputPath('cabinet.png'));
  const png = await readFile((await download.path())!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.readUInt32BE(20)).toBeGreaterThan(500);
  expect(png.length).toBeGreaterThan(10000);
  // Export restores the interactive canvas size; geometry remains untouched.
  const size = await canvas.boundingBox();
  expect(size!.width).toBeLessThan(1600);
  expect((await save(page)).bodies).toEqual(parts);
  // Compile the reflective and transmissive material paths as well.
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  const material = page.getByRole('combobox', { name: 'Materiaali', exact: true });
  for (const preset of ['metal', 'glass', 'paint']) {
    await material.selectOption(preset);
    await expect(material).toHaveValue(preset);
  }
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await expect(page.getByTestId('viewport')).toBeVisible();
  expect(errors).toEqual([]);
});
