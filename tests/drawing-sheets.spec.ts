import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody } from '../src/model/project';
import { sectionFrame } from '../src/model/sections';
import { ready, save, view, click, revealBrowser } from './helpers';
import { addOverallDimensions } from '../src/model/dimensions';

test('saved sheet combines three dimensioned views and a section, exports actual A4 and restores after reload', async ({
  page,
}, info) => {
  const body = { ...makeBody(600, 400, 720, [0, 0, 0], 'Kaappi'), groupId: 'cabinet' };
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'sheet.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [body],
        groups: [{ id: 'cabinet', name: 'Kaappi', kind: 'assembly', hidden: false }],
        sections: [
          {
            id: 'a',
            name: 'A–A',
            frame: sectionFrame('y', [0, 200, 0]),
            flipped: false,
            dimensions: [],
          },
        ],
      }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Luo mitta-arkki', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Mitta-arkin kohde', exact: true })
    .selectOption('group:cabinet');
  await page.getByRole('textbox', { name: 'Arkin nimi', exact: true }).fill('Kaapin työkuvat');
  await page.getByRole('checkbox', { name: 'Leikkaus A–A', exact: true }).check();
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  const paper = page.getByTestId('multi-sheet-area');
  await expect(paper.locator('[data-sheet-view]')).toHaveCount(4);
  await expect(paper.locator('[data-section-body]')).toHaveCount(1);
  await expect(paper.locator('[data-mm="600"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Vie PDF', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tallenna arkki', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Arkki tallessa', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('four-view-sheet.png') });
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie SVG', exact: true }).click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  expect(svg).toContain('width="297mm" height="210mm"');
  expect(svg.match(/data-scale="20"/g)).toHaveLength(4);
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie PDF', exact: true }).click();
  const pdf = await readFile((await (await download).path())!);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const box = /\/MediaBox \[([\d.\s]+)\]/
    .exec(pdf.toString('latin1'))![1]
    .trim()
    .split(/\s+/)
    .map(Number);
  expect((box[2] * 25.4) / 72).toBeCloseTo(297, 2);
  expect((box[3] * 25.4) / 72).toBeCloseTo(210, 2);
  await page.getByRole('combobox', { name: 'Arkin yhteinen mittakaava' }).selectOption('1');
  await expect(page.getByRole('button', { name: 'Vie PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Sovita arkille', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vie PDF', exact: true })).toBeEnabled();
  const saved = await save(page);
  expect(saved.drawingSheets?.[0].scope).toEqual({ kind: 'group', groupId: 'cabinet' });
  expect(saved.bodies).toEqual([body]);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Luo mitta-arkki', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Arkin nimi', exact: true })).toHaveValue(
    'Kaapin työkuvat',
  );
  await expect(page.getByTestId('multi-sheet-area').locator('[data-sheet-view]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Vie SVG', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Poista arkki', exact: true }).click();
  expect((await save(page)).drawingSheets).toEqual([]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).drawingSheets).toHaveLength(1);
});

test('a saved group sheet recomputes after moving a member; missing explicit sheet members block export', async ({
  page,
}) => {
  const a = { ...makeBody(200, 100, 20), groupId: 'group' },
    b = { ...makeBody(200, 100, 20, [300, 0, 0]), groupId: 'group' };
  const p = addOverallDimensions(
    { ...freshProject(), bodies: [a, b], groups: [{ id: 'group', name: 'Rivi', hidden: false }] },
    { kind: 'group', groupId: 'group' },
    ['x'],
  );
  const sheets = [
    {
      id: 'group-sheet',
      name: 'Ryhmän arkki',
      scope: { kind: 'group', groupId: 'group' },
      views: [{ kind: 'standard', view: 'front' }],
      hidden: false,
    },
    {
      id: 'parts-sheet',
      name: 'Osajoukon arkki',
      scope: { kind: 'parts', ids: [a.id, b.id] },
      views: [{ kind: 'standard', view: 'front' }],
      hidden: false,
    },
  ];
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'sheets.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...p, drawingSheets: sheets })),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Luo mitta-arkki', exact: true }).click();
  await expect(page.getByTestId('multi-sheet-area').locator('[data-mm="500"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  const at = await view(page, [a, b]);
  await click(page, at(100, 50, 20));
  await page.keyboard.press('m');
  await click(page, at(100, 50, 20));
  await page.getByTestId('move-x').fill('-300');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.getByTestId('multi-sheet-area').locator('[data-mm="800"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Vie SVG', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByRole('button', { name: /^Kappaleet / }).click();
  await page.getByTestId(`body-${b.id}`).click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.getByTestId('multi-sheet-area').locator('[data-mm="200"]')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Tallennettu mitta-arkki', exact: true })
    .selectOption('parts-sheet');
  await expect(page.getByRole('alert')).toContainText('puuttuu osia');
  await expect(page.getByRole('button', { name: 'Vie SVG', exact: true })).toBeDisabled();
});
