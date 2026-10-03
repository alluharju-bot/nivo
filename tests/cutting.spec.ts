import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody, makeProfileBody, type BodyGroup } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, save } from './helpers';

test('cabinet explosion and printable nesting share assembly scope and part numbers without changing geometry', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const groups: BodyGroup[] = [
    { id: 'cabinet', name: 'Kaappi', hidden: false },
    { id: 'rails', name: 'Sidelistat', parentId: 'cabinet', hidden: false },
  ];
  const bodies = [
    makeBody(18, 600, 720, [0, 0, 0], 'Vasen sivu'),
    makeBody(18, 600, 720, [582, 0, 0], 'Oikea sivu'),
    makeBody(564, 600, 18, [18, 0, 0], 'Pohja'),
    makeBody(564, 600, 18, [18, 0, 702], 'Katto'),
    makeBody(564, 18, 80, [18, 582, 622], 'Yläsidelista'),
    makeBody(564, 18, 80, [18, 582, 18], 'Alasidelista'),
  ].map((b, i) => ({ ...b, groupId: i < 4 ? 'cabinet' : 'rails' }));
  const outside = makeBody(300, 200, 12, [1000, 0, 0], 'Muu osa');
  await ready(page, [...bodies, outside], [], groups);
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await page.getByLabel('Osaluettelon kohde').selectOption('cabinet');
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(6);
  await page.getByRole('slider', { name: 'Räjäytyksen määrä' }).fill('1.2');
  await page.getByRole('button', { name: 'Sovita malli', exact: true }).click();
  await page.screenshot({ path: info.outputPath('cabinet-radial.png') });
  await page.getByRole('button', { name: 'Leikkauslista', exact: true }).click();
  await expect(page.locator('.cut-table tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('cut-sheet')).toHaveCount(1);
  await expect(page.locator('[data-cut-part]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Leikkausosa: Yläsidelista' }).click();
  await expect(page.locator('.cut-part-editor legend')).toHaveText('#5 Yläsidelista');
  await expect(page.locator('.cut-table tr[data-selected="true"]')).toContainText('564 × 80 × 18');
  await page.getByLabel('Levykoko', { exact: true }).selectOption('2440x1220');
  await expect(page.getByRole('button', { name: 'Tallenna PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Päivitä asettelu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tallenna PDF', exact: true })).toBeEnabled();
  await page.locator('.cut-preview').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: info.outputPath('cutting-plan.png') });
  const pdfPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna PDF', exact: true }).click();
  const pdf = await pdfPending;
  expect(pdf.suggestedFilename()).toMatch(/leikkauslista\.pdf$/);
  await pdf.saveAs(info.outputPath('cutting-plan.pdf'));
  const pdfBytes = await readFile((await pdf.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  const count = await page.getByTestId('cut-sheet').count();
  expect(pdfBytes.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(count + 1);
  const csvPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie leikkauslista CSV' }).click();
  const csv = await readFile((await (await csvPending).path())!, 'utf8');
  expect(csv).toContain('"5";"Yläsidelista";"Kaappi / Sidelistat"');
  expect(csv).toContain('"564";"80";"18"');
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printCalled = 'yes';
    };
  });
  await page.getByRole('button', { name: 'Tulosta leikkauslista' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.locator('.cut-settings')).toBeHidden();
  await expect(page.locator('.cut-print-lists')).toBeVisible();
  const printed = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    path: info.outputPath('printed-cutting-plan.pdf'),
  });
  expect(printed.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(count + 1);
  await page.emulateMedia({ media: 'screen' });
  const saved = await save(page);
  expect(saved.bodies).toEqual([...bodies, outside]);
  expect(saved.settings.cutting).toMatchObject({
    length: 2440,
    width: 1220,
    kerf: 3.2,
    margin: 10,
  });
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await page.getByRole('button', { name: 'Leikkauslista', exact: true }).click();
  await expect(page.getByLabel('Levyn pituus', { exact: true })).toHaveValue('2440');
  expect(errors).toEqual([]);
});

test('grain constraints, manual blanks, invalid inputs and exclusions remain explicit and persistent', async ({
  page,
}, info) => {
  const panel = makeBody(800, 500, 18, [0, 0, 0], 'Ovi');
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([1100, 0, 0]), 18);
  circle.name = 'Pyöreä kansi';
  await ready(page, [panel, circle]);
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await page.getByRole('button', { name: 'Leikkauslista', exact: true }).click();
  await expect(page.locator('.cut-warning[role="status"]')).toContainText(
    '1 osaa odottaa tarkistusta',
  );
  await page.getByLabel('Levyn pituus', { exact: true }).fill('600');
  await page.getByLabel('Levyn leveys', { exact: true }).fill('900');
  await page.getByLabel('Reunavara', { exact: true }).fill('450');
  await page.getByRole('button', { name: 'Päivitä asettelu' }).click();
  await expect(page.getByRole('alert')).toContainText('Reunavaran jälkeen');
  await page.getByLabel('Reunavara', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Päivitä asettelu' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Leikkausosa: Ovi' }).click();
  await page.getByLabel('Osan syysuunta').selectOption('length');
  await expect(page.locator('.cut-warning[role="status"]')).toContainText(
    '2 osaa odottaa tarkistusta',
  );
  await expect(page.getByTestId('cut-sheet')).toHaveCount(0);
  await page.getByLabel('Osan syysuunta').selectOption('width');
  await expect(page.getByTestId('cut-sheet')).toHaveCount(1);
  await page.getByRole('button', { name: 'Leikkausosa: Pyöreä kansi' }).click();
  await expect(page.getByLabel('Aihion pituus', { exact: true })).toHaveValue('');
  await page.getByLabel('Aihion pituus', { exact: true }).fill('210');
  await page.getByLabel('Aihion leveys', { exact: true }).fill('210');
  await page.getByLabel('Aihion paksuus', { exact: true }).fill('18');
  await page.getByRole('button', { name: 'Käytä aihion mittoja' }).click();
  await expect(page.locator('.cut-warning[role="status"]')).toHaveCount(0);
  await expect(page.locator('[data-cut-part]')).toHaveCount(2);
  await expect(page.locator('.cut-table tr[data-selected="true"]')).toContainText(
    'Käsin annettu aihio',
  );
  await page.getByRole('checkbox', { name: 'Mukana leikkauslistassa' }).uncheck();
  await expect(page.locator('[data-cut-part]')).toHaveCount(1);
  await expect(page.locator('.cut-table tr[data-selected="true"]')).toContainText('Ei mukana');
  await page.screenshot({ path: info.outputPath('cutting-part-editor.png') });
  const saved = await save(page);
  expect(saved.bodies).toEqual([panel, circle]);
  expect(saved.settings.cutting?.parts?.[panel.id]?.grain).toBe('width');
  expect(saved.settings.cutting?.parts?.[circle.id]).toMatchObject({
    included: false,
    blank: { dimensions: [210, 210, 18] },
  });
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('[data-cut-part]')).toHaveCount(2);
});
