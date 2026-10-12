import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { ready } from './helpers';

test('100 actual edits survive reload, undo/redo and a replacement branch', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page, [makeBody()]);
  if (process.env.NIVO_AUDIT_MODEL) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'private-history-audit.nivo',
      mimeType: 'application/json',
      buffer: await readFile(process.env.NIVO_AUDIT_MODEL),
    });
    await expect
      .poll(
        async () => Number(await page.getByTestId('viewport').getAttribute('data-mesh-count')),
        { timeout: 90000 },
      )
      .toBeGreaterThan(100);
  }
  const name = page.getByRole('textbox', { name: 'Projektin nimi', exact: true });
  for (let i = 1; i <= 105; i++) {
    await name.fill(`Historiatesti ${i}`);
    await name.press('Enter');
    await expect(page.locator('.save-status')).toHaveText('Tallessa selaimessa');
    await expect(name).toHaveValue(`Historiatesti ${i}`);
  }
  const inspectCounts = async (undo: number, redo: number) => {
    await page.getByRole('button', { name: 'Toimintohistoria', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Viimeisimmät toiminnot' })).toContainText(
      `Peruttavissa ${undo} / 100 toimintoa · Uudelleen tehtävissä ${redo}.`,
    );
    await page.getByRole('button', { name: 'Sulje toimintohistoria' }).click();
  };
  await inspectCounts(100, 0);
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await expect(name).toHaveValue('Historiatesti 105');
  await inspectCounts(100, 0);
  const undo = page.getByRole('button', { name: 'Peru', exact: true });
  for (let i = 104; i >= 5; i--) {
    await undo.click();
    await expect(name).toHaveValue(`Historiatesti ${i}`);
  }
  await expect(undo).toBeDisabled();
  await expect(page.locator('.save-status')).toHaveText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await inspectCounts(0, 100);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(name).toHaveValue('Historiatesti 6');
  await name.fill('Uusi haara');
  await name.press('Enter');
  await expect(page.locator('.save-status')).toHaveText('Tallessa selaimessa');
  await expect(page.getByRole('button', { name: 'Palauta', exact: true })).toBeDisabled();
  await undo.click();
  await expect(name).toHaveValue('Historiatesti 6');
  await inspectCounts(1, 1);
  expect(errors).toEqual([]);
});
