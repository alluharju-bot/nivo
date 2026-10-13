import { sectionSchema, sectionFrame } from '../src/model/sections';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready, save, view } from './helpers';
import { freshProject, makeBody } from '../src/model/project';

async function paperPoint(page: Page, x: number, y: number) {
  const r = (await page.locator('.drawing-paper svg').first().boundingBox())!;
  return { x: r.x + (x / 297) * r.width, y: r.y + (y / 210) * r.height };
}
async function note(page: Page, text: string) {
  await page.getByRole('button', { name: 'Tekstilaatikko', exact: true }).click();
  const p = await paperPoint(page, 185, 135);
  if (test.info().project.name === 'tablet') await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  const input = page.getByRole('textbox', { name: 'Arkin huomautus', exact: true });
  await expect(input).toBeFocused();
  await input.fill(text);
  await input.press('Control+Enter');
  await expect(page.locator('.drawing-paper [data-paper-annotation] text')).toContainText(text);
}

test('page notes and highlights persist, export, hide, move and undo without changing model geometry', async ({
  page,
}, info) => {
  const body = makeBody(600, 400, 800);
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  await note(page, 'Tarkista sauma ennen asennusta');
  const original = await save(page);
  expect(original.drawingAnnotations).toHaveLength(1);
  const id = original.drawingAnnotations![0].id;
  const p = await paperPoint(page, 195, 140);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 50, p.y - 30, { steps: 4 });
  await page.mouse.up();
  const moved = await save(page);
  expect(moved.drawingAnnotations![0].x).toBeLessThan(original.drawingAnnotations![0].x);
  expect(moved.bodies).toEqual(original.bodies);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).drawingAnnotations).toEqual(original.drawingAnnotations);
  await page.getByRole('button', { name: 'Korosta alue', exact: true }).click();
  const a = await paperPoint(page, 70, 75),
    b = await paperPoint(page, 140, 110);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.drawing-paper [data-paper-annotation]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Piilota arkkimerkintä', exact: true }).first().click();
  await expect(page.locator(`.drawing-paper [data-paper-annotation="${id}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Näytä arkkimerkintä', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true }).click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  expect(svg).toContain('Tarkista sauma');
  expect(svg).toContain('data-kind="highlight"');
  expect(svg).not.toContain('data-annotation-resize');
  await page.getByLabel('Projektion suunta', { exact: true }).selectOption('back');
  await expect(page.locator('.drawing-paper svg[aria-label^="Takakuva"]')).toBeVisible();
  await expect(page.locator('.drawing-paper [data-paper-annotation]')).toHaveCount(0);
  await page.getByLabel('Projektion suunta', { exact: true }).selectOption('front');
  await expect(page.locator('.drawing-paper [data-paper-annotation]')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('drawing-annotations.png') });
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-paper-annotation]')).toHaveCount(2);
});

test('notes auto-save a new multi-view sheet and double clicking a projection opens its dimension workspace', async ({
  page,
}) => {
  await ready(page, [makeBody()]);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Luo mitta-arkki', exact: true }).click();
  await expect(page.locator('[data-sheet-view]')).toHaveCount(3);
  await note(page, 'Asennusohje');
  const p = await save(page);
  expect(p.drawingSheets).toHaveLength(1);
  expect(p.drawingAnnotations![0].page).toEqual({ kind: 'sheet', sheetId: p.drawingSheets![0].id });
  await page.getByRole('button', { name: 'Yksittäiset mittakuvat', exact: true }).click();
  await page.getByRole('button', { name: 'Luo mitta-arkki', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-paper-annotation]')).toHaveCount(1);
  await page.locator('[data-sheet-view="top"] text').last().dblclick();
  await expect(page.getByLabel('Projektion suunta', { exact: true })).toHaveValue('top');
  await expect(page.getByRole('button', { name: 'Lisää mitta', exact: true })).toBeVisible();
});

test('version comparison classifies the three changes and named snapshots survive reopening', async ({
  page,
}, info) => {
  const kept = makeBody(300, 100, 40, [0, 0, 0], 'Siirretty lauta');
  const removed = makeBody(80, 100, 50, [0, 200, 0], 'Vanha osa');
  const added = makeBody(100, 80, 70, [450, 0, 0], 'Lisäosa');
  const moved = { ...kept, origin: [60, 0, 0] as [number, number, number] };
  await ready(page, [moved, added]);
  const before = { ...freshProject(), name: 'Aiempi versio', bodies: [kept, removed] };
  const current = await save(page);
  await page.getByRole('button', { name: 'Projektin muutokset', exact: true }).click();
  await page.getByLabel('Aiempi projektiversio', { exact: true }).setInputFiles({
    name: 'Versio A.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(before)),
  });
  const dialog = page.getByRole('dialog', { name: 'Projektin muutokset', exact: true });
  await expect(dialog.locator('[data-change="added"]')).toHaveCount(1);
  await expect(dialog.locator('[data-change="removed"]')).toHaveCount(1);
  await expect(dialog.locator('[data-change="modified"]')).toHaveCount(1);
  await expect(dialog.locator('.revision-scene canvas')).toBeVisible();
  await expect(dialog.getByText('Valmistellaan aiempaa geometriaa…')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Siirretty lauta/ }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Vie muutosluettelo', exact: true }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toContain('Poistettu');
  expect(csv).toContain('Sijainti');
  expect(csv).toContain('Lisätty');
  await page.screenshot({ path: info.outputPath('revision-review.png') });
  await dialog.getByText('Tallenna nykyinen versio', { exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Version nimi', exact: true })
    .fill('Asiakkaalle 13.10.');
  await dialog.getByRole('button', { name: 'Tallenna vertailuversio', exact: true }).click();
  await expect(
    dialog.getByText('Ei osamuutoksia vertailuversioon nähden.', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Sulje vertailu', exact: true }).click();
  expect((await save(page)).bodies).toEqual(current.bodies);
  await page.getByRole('button', { name: 'Projektin muutokset', exact: true }).click();
  await expect(
    dialog.getByText('Ei osamuutoksia vertailuversioon nähden.', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel('Vertailuversio', { exact: true }).locator('option:checked'),
  ).toContainText('Asiakkaalle 13.10.');
});

test('standalone model note needs one placement and remains visible in its orthographic drawing', async ({
  page,
}, info) => {
  const body = makeBody(1000, 800, 20);
  await ready(page, [body]);
  const at = await view(page, [body]);
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Huomautus/ }).click();
  await page.getByRole('checkbox', { name: 'Kohdistusviiva', exact: true }).uncheck();
  const p = at(500, 400, 20);
  if (info.project.name === 'tablet') await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(
    page.getByRole('textbox', { name: 'Huomautuksen teksti', exact: true }),
  ).toBeFocused();
  const saved = await save(page);
  expect(saved.annotations).toHaveLength(1);
  expect(saved.annotations![0]).toMatchObject({ kind: 'note', leader: false, offset: [0, 0, 0] });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByLabel('Projektion suunta', { exact: true }).selectOption('top');
  await expect(page.locator('.drawing-paper [data-markup]')).toHaveCount(1);
  await expect(page.locator('.drawing-paper .note-leader')).toHaveCount(0);
});

test('section drawing notes reach SVG and PDF without changing section geometry', async ({
  page,
}) => {
  await ready(page);
  const project = freshProject();
  project.bodies = [makeBody(600, 400, 720)];
  project.sections = [
    sectionSchema.parse({ id: 'a', name: 'A–A', frame: sectionFrame('y', [0, 200, 0]) }),
  ];
  await page.getByTestId('project-file').setInputFiles({
    name: 'section.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Leikkaus A–A', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-section-body]')).toHaveCount(1);
  await note(page, 'Tarkista liittymä');
  const saved = await save(page);
  expect(saved.sections).toEqual(project.sections);
  expect(saved.drawingAnnotations![0].page).toMatchObject({ kind: 'section', sectionId: 'a' });
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lataa SVG', exact: true }).click();
  expect(await readFile((await (await svgDownload).path())!, 'utf8')).toContain(
    'Tarkista liittymä',
  );
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lataa PDF', exact: true }).click();
  const pdf = await readFile((await (await pdfDownload).path())!, 'latin1');
  expect(pdf).toContain('%PDF-');
});
