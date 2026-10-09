import { expect, test, type Page } from '@playwright/test';
import { ready, view, save } from './helpers';
import { makeBody, freshProject, areaMarkupSchema, noteMarkupSchema } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { areaUnion } from '../src/model/markups';

async function tool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}
async function labelClick(page: Page, id: string) {
  await expect(page.locator(`.model-markups [data-markup="${id}"] .markup-label`)).toBeVisible();
  const b = (await page
    .locator(`.model-markups [data-markup="${id}"] .markup-label`)
    .boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
test('area rectangles merge once on Enter, persist, hide and undo as one operation', async ({
  page,
}, info) => {
  const body = makeBody(2000, 2000, 20);
  await ready(page, [body]);
  const at = await view(page, [body]);
  await tool(page, 'Pinta-ala');
  await page.getByRole('textbox', { name: 'Uuden alueen nimi' }).fill('Laatoitus');
  for (const [x, y] of [
    [200, 200],
    [1200, 1200],
    [700, 200],
    [1700, 1200],
  ]) {
    const p = at(x, y, 20);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('area-total')).toHaveText('1,5 m²');
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('button', { name: 'Toimintohistoria' })
      .getByText('Viimeisin: Pinta-alue yhdistetty ja tallennettu.', { exact: true }),
  ).toBeVisible();
  let saved = await save(page);
  expect(saved.annotations).toHaveLength(1);
  const area = saved.annotations![0];
  expect(area.kind).toBe('area');
  if (area.kind !== 'area') throw Error('area');
  expect(area.rectangles).toHaveLength(2);
  expect(areaUnion(area.rectangles).area).toBeCloseTo(1_500_000, 0);
  expect(saved.bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await page.keyboard.press('Escape');
  await labelClick(page, area.id);
  await expect(page.locator('.model-markups .is-selected')).toHaveCount(1);
  const name = page.getByRole('textbox', { name: 'Alueen nimi', exact: true });
  await name.fill('Kylpyhuone');
  await name.press('Enter');
  await page
    .getByRole('region', { name: 'Pinta-alueen asetukset' })
    .getByRole('button', { name: 'Piilota merkintä', exact: true })
    .click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Pinta-alueen asetukset' })
    .getByRole('button', { name: 'Näytä merkintä', exact: true })
    .click();
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.model-markups text')).toContainText('Kylpyhuone');
  await page.screenshot({ path: info.outputPath('area-markup.png') });
  saved = await save(page);
  expect(saved.annotations?.[0]).toMatchObject({ kind: 'area', name: 'Kylpyhuone', hidden: false });
});

test('callouts anchor, edit, restyle, drag, hide and export without changing the model', async ({
  page,
}, info) => {
  const body = makeBody(1000, 800, 20);
  await ready(page, [body]);
  const at = await view(page, [body]);
  await tool(page, 'Huomautus');
  await page
    .getByRole('textbox', { name: 'Uuden huomautuksen teksti' })
    .fill('Tähän nurkkaan laattalista');
  for (const p of [at(1000, 800, 20), at(800, 500, 20)]) await page.mouse.click(p.x, p.y);
  await expect(
    page.getByRole('textbox', { name: 'Huomautuksen teksti', exact: true }),
  ).toBeFocused();
  await expect(
    page
      .getByRole('button', { name: 'Toimintohistoria' })
      .getByText('Viimeisin: Huomautus tallennettu.', { exact: true }),
  ).toBeVisible();
  let saved = await save(page);
  const note = saved.annotations![0];
  expect(note.kind).toBe('note');
  if (note.kind !== 'note') throw Error('note');
  expect(note.anchor).not.toHaveProperty('point');
  expect(note.fallback).toEqual([1000, 800, 20]);
  await page.keyboard.press('Escape');
  await labelClick(page, note.id);
  const text = page.getByRole('textbox', { name: 'Huomautuksen teksti', exact: true });
  await text.fill('Lista <valkoinen>');
  await text.press('Enter');
  await page.getByText('Tekstin ja kehyksen tyyli', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Tekstilaatikon muoto' }).selectOption('square');
  await page.getByRole('combobox', { name: 'Huomautuksen tekstikoko' }).selectOption('20');
  const label = page.locator(`.model-markups [data-markup="${note.id}"] .markup-label`);
  await expect(label.locator('text')).toHaveAttribute('font-size', '20');
  const b = (await label.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(
    page
      .getByRole('button', { name: 'Toimintohistoria' })
      .getByText('Viimeisin: Merkintä päivitetty.', { exact: true }),
  ).toBeVisible();
  saved = await save(page);
  expect(saved.bodies).toEqual([body]);
  expect(saved.annotations?.[0]).toMatchObject({
    text: 'Lista <valkoinen>',
    shape: 'square',
    fontSize: 20,
    anchor: note.anchor,
  });
  expect(saved.annotations?.[0]).not.toMatchObject({ offset: note.offset });
  await page.screenshot({ path: info.outputPath('text-callout.png') });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-markup] text')).toHaveText('Lista <valkoinen>');
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await view(page, [body]);
  await labelClick(page, note.id);
  await expect(page.locator('.model-markups .is-selected')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(1);
});

test('wall areas stay on the wall plane, support dragging, backtracking and cancellation', async ({
  page,
}) => {
  const wall = makeBody(2000, 100, 1500);
  await ready(page, [wall]);
  const at = await view(page, [wall], 'front');
  await tool(page, 'Pinta-ala');
  const a = at(200, 0, 200),
    b = at(1200, 0, 1200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('area-total')).toHaveText('1 m²');
  const c = at(500, 0, 500);
  await page.mouse.click(c.x, c.y);
  await page.mouse.move(b.x, b.y);
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('area-total')).toHaveText('1 m²');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Alueen nimi', exact: true })).toBeVisible();
  const saved = await save(page),
    area = saved.annotations![0];
  if (area.kind !== 'area') throw Error('area');
  expect(Math.abs(area.frame.normal[1])).toBe(1);
  expect(area.frame.origin[1]).toBeCloseTo(0, 5);
  expect(areaUnion(area.rectangles).area).toBe(1_000_000);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Escape');
  expect((await save(page)).annotations).toEqual(saved.annotations);
});

test('individual and global visibility coexist; a selection box deletes and restores all markup kinds', async ({
  page,
}, info) => {
  const body = makeBody(1000, 800, 20);
  const area = areaMarkupSchema.parse({
    id: 'area',
    kind: 'area',
    name: 'Laatoitus',
    frame: sketchFrame([0, 0, 20], [0, 0, 1]),
    rectangles: [[100, 100, 500, 400]],
  });
  const note = noteMarkupSchema.parse({
    id: 'note',
    kind: 'note',
    text: 'Lista',
    anchor: { point: [1000, 800, 20] },
    fallback: [1000, 800, 20],
    offset: [200, 100, 0],
  });
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'markups.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...freshProject(), bodies: [body], annotations: [area, note] }),
    ),
  });
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(2);
  const at = await view(page, [body]);
  await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).press('Enter');
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  await browser.getByRole('button', { name: 'Merkinnät 2', exact: true }).click();
  await page
    .getByTestId('markup-row-note')
    .getByRole('button', { name: 'Piilota merkintä', exact: true })
    .click();
  await browser
    .getByRole('button', { name: 'Piilota pinta-alueet ja huomautukset', exact: true })
    .click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(0);
  await browser
    .getByRole('button', { name: 'Näytä pinta-alueet ja huomautukset', exact: true })
    .click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(1);
  await page
    .getByTestId('markup-row-note')
    .getByRole('button', { name: 'Näytä merkintä', exact: true })
    .click();
  await page.screenshot({ path: info.outputPath('markups-list.png') });
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
  const boxAt = await view(page, [body]);
  // Start on the empty right side, outside the intentionally hover-expanding model list.
  const a = boxAt(1400, -150, 20),
    b = boxAt(-100, 1000, 20);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.model-markups .is-selected')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(0);
  const saved = await save(page);
  expect(saved.annotations).toEqual([]);
  expect(saved.bodies).toEqual([]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.model-markups [data-markup]')).toHaveCount(2);
});
