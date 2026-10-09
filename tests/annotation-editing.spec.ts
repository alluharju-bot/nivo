import { expect, test, type Page } from '@playwright/test';
import { ready, view, save } from './helpers';
import { freshProject, makeBody, type Project } from '../src/model/project';

async function setup(page: Page) {
  const body = makeBody(600, 400, 20);
  const project: Project = {
    ...freshProject(),
    bodies: [body],
    guides: [
      {
        id: 'guide',
        mode: 'guide',
        plane: 'XY',
        angle: 0,
        length: 250,
        anchor: { point: [150, 180, 20] },
        direction: [1, 0, 0],
      },
      {
        id: 'free',
        mode: 'free',
        plane: 'XY',
        angle: 0,
        length: 200,
        anchor: { point: [150, 270, 20] },
        endAnchor: { point: [350, 270, 20] },
      },
    ],
    dimensions: [
      { id: 'extent', bodyId: body.id, axis: 'x', from: 'min', to: 'max' },
      {
        id: 'points',
        kind: 'points',
        start: { point: [100, 100, 20] },
        end: { point: [500, 100, 20] },
        fallback: [
          [100, 100, 20],
          [500, 100, 20],
        ],
        axis: 'distance',
        offset: [0, -50, 0],
        normal: [0, 0, 1],
      },
    ],
  };
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'annotations.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId('dimension-3d')).toHaveCount(2);
  await view(page, [body]);
  return project;
}
async function labelClick(page: Page, id: string, double = false) {
  const label = page.locator(`.model-dimensions [data-dimension="${id}"] .dimension-label`);
  const b = (await label.boundingBox())!;
  if (double) await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function browserTab(page: Page, name: string) {
  if (
    (await page
      .getByRole('complementary', { name: 'Mallilista' })
      .getAttribute('data-expanded')) === 'false'
  )
    await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).press('Enter');
  await page
    .getByRole('complementary', { name: 'Mallilista' })
    .getByRole('button', { name: new RegExp(`^${name} `) })
    .click();
}

test('dimensions select in orange, edit text without moving geometry and support undo, multi-select and delete', async ({
  page,
}, info) => {
  const original = await setup(page);
  await labelClick(page, 'extent');
  const extent = page.locator('.model-dimensions [data-dimension="extent"]');
  await expect(extent).toHaveClass(/is-selected/);
  await expect(extent.locator('path:not(.dimension-hit)')).toHaveCSS('stroke', 'rgb(229, 120, 32)');
  await labelClick(page, 'points', true);
  const input = page.getByRole('textbox', { name: 'Merkinnän teksti', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Aukko {mitta} mm');
  await input.press('Enter');
  await expect(page.locator('.model-dimensions [data-dimension="points"] text')).toHaveText(
    'Aukko 400 mm',
  );
  await page.screenshot({ path: info.outputPath('dimension-selected.png') });
  let saved = await save(page);
  expect(saved.bodies).toEqual(original.bodies);
  expect(saved.dimensions[1]).toEqual({ ...original.dimensions[1], label: 'Aukko {mitta} mm' });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.model-dimensions [data-dimension="points"] text')).toHaveText(
    '400 mm',
  );
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await labelClick(page, 'points');
  await page.keyboard.down('Shift');
  await labelClick(page, 'extent');
  await page.keyboard.up('Shift');
  await expect(page.locator('.model-dimensions .is-selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Piilota valitut merkinnät', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
  await page.getByRole('button', { name: 'Näytä valitut merkinnät', exact: true }).click();
  await expect(page.locator('.model-dimensions .is-selected')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
  saved = await save(page);
  expect(saved.bodies).toEqual(original.bodies);
  expect(saved.guides).toEqual(original.guides);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(2);
});

test('individual dimensions, guides and measurements hide and return through the list after reload', async ({
  page,
}) => {
  const original = await setup(page);
  await browserTab(page, 'Mitat');
  await page
    .getByTestId('dimension-row-extent')
    .getByRole('button', { name: 'Piilota dimensio', exact: true })
    .click();
  await expect(page.locator('.model-dimensions [data-dimension="extent"]')).toHaveCount(0);
  await browserTab(page, 'Viivat');
  for (const id of ['guide', 'free'])
    await page
      .getByTestId(`guide-row-${id}`)
      .getByRole('button', { name: 'Piilota viiva', exact: true })
      .click();
  await expect(page.getByTestId('guide-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Piilota kaikki mittaviivat', exact: true }).click();
  await page.getByRole('button', { name: 'Näytä kaikki mittaviivat', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(1);
  await expect(page.getByTestId('guide-label')).toHaveCount(0);
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(1);
  await browserTab(page, 'Mitat');
  await page
    .getByTestId('dimension-row-extent')
    .getByRole('button', { name: 'Näytä dimensio', exact: true })
    .click();
  await browserTab(page, 'Viivat');
  for (const id of ['guide', 'free'])
    await page
      .getByTestId(`guide-row-${id}`)
      .getByRole('button', { name: 'Näytä viiva', exact: true })
      .click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(2);
  await expect(page.getByTestId('guide-label')).toHaveCount(2);
  const saved = await save(page);
  expect(saved.bodies).toEqual(original.bodies);
  expect(saved.guides.every((g) => g.hidden === false)).toBe(true);
});

test('drawing text and visibility use the same annotation and persist back into the model', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  const row = page.getByTestId('drawing-dimension-row-extent');
  await page.locator('.drawing-paper [data-dimension="extent"] text').dblclick();
  const input = page.getByRole('textbox', { name: 'Merkinnän teksti', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Leveys {mitta}');
  await input.press('Enter');
  await expect(page.locator('.drawing-paper [data-dimension="extent"] text')).toHaveText(
    'Leveys 600',
  );
  await row.getByRole('button', { name: 'Piilota dimensio', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-dimension="extent"]')).toHaveCount(0);
  await row.getByRole('button', { name: 'Näytä dimensio', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-dimension="extent"]')).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await expect(page.locator('.model-dimensions [data-dimension="extent"] text')).toHaveText(
    'Leveys 600',
  );
  await page.getByRole('button', { name: 'Piilota kaikki mittaviivat', exact: true }).click();
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-dimension]')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Kaikki merkinnät on piilotettu · Näytä merkinnät', exact: true })
    .click();
  await expect(page.locator('.drawing-paper [data-dimension="extent"] text')).toHaveText(
    'Leveys 600',
  );
});

test('dimension lines can be picked away from the label, dragged and restored with their selection', async ({
  page,
}) => {
  const original = await setup(page);
  const line = page.locator('.model-dimensions [data-dimension="points"] path:not(.dimension-hit)');
  const p = await line.evaluate((node) => {
    const path = node as SVGPathElement;
    const point = path.getPointAtLength(120).matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.model-dimensions [data-dimension="points"]')).toHaveClass(
    /is-selected/,
  );
  expect((await save(page)).dimensions).toEqual(original.dimensions);
  const label = page.locator('.model-dimensions [data-dimension="points"] .dimension-label');
  const b = (await label.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const changed = await save(page);
  expect(changed.bodies).toEqual(original.bodies);
  expect(changed.dimensions.find((d) => d.id === 'points')).not.toEqual(original.dimensions[1]);
  await expect(page.locator('.model-dimensions [data-dimension="points"]')).toHaveClass(
    /is-selected/,
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).dimensions).toEqual(original.dimensions);
  await page.getByRole('button', { name: 'Palauta edellinen valinta', exact: true }).click();
  await expect(page.locator('.model-dimensions [data-dimension="points"]')).toHaveClass(
    /is-selected/,
  );
});

test('a selection rectangle includes dimensions and hidden guides stop snapping', async ({
  page,
}) => {
  const original = await setup(page);
  const extent = page.locator('.model-dimensions [data-dimension="extent"]');
  const b = (await extent.boundingBox())!;
  await page.mouse.move(b.x - 12, b.y - 12);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 12, b.y + b.height + 12, { steps: 8 });
  await page.mouse.up();
  await expect(extent).toHaveClass(/is-selected/);
  await expect(page.locator('.model-dimensions .is-selected')).toHaveCount(1);
  const p = await view(page, original.bodies);
  await browserTab(page, 'Viivat');
  await page
    .getByTestId('guide-row-free')
    .getByRole('button', { name: 'Piilota viiva', exact: true })
    .click();
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
  await page.keyboard.press('k');
  const target = p(150, 270, 20);
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-snap-key', /free/);
  await browserTab(page, 'Viivat');
  await page
    .getByTestId('guide-row-free')
    .getByRole('button', { name: 'Näytä viiva', exact: true })
    .click();
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
  await page.mouse.move(target.x + 1, target.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-key', /free/);
});

test('section dimensions also select, edit and hide without modifying the cut or bodies', async ({
  page,
}) => {
  const original = await setup(page);
  const body = original.bodies[0];
  const { sectionFrame, sectionBodySignature } = await import('../src/model/sections');
  const signature = sectionBodySignature(body);
  const section = {
    id: 'section',
    name: 'A–A',
    flipped: false,
    frame: sectionFrame('z', [0, 0, 10]),
    dimensions: [
      {
        id: 'section-dim',
        start: { bodyId: body.id, point: [0, 0, 10], signature },
        end: { bodyId: body.id, point: [600, 0, 10], signature },
        axis: 'horizontal',
        offset: 60,
      },
    ],
  };
  await page.getByTestId('project-file').setInputFiles({
    name: 'section.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...original, sections: [section] })),
  });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('button', { name: 'Leikkaus A–A', exact: true }).click();
  const dimension = page.locator('.drawing-paper [data-section-dimension="section-dim"]');
  await expect(dimension).toHaveAttribute('data-mm', '600');
  await dimension.locator('text').dblclick();
  await expect(dimension).toHaveClass(/is-selected/);
  const input = page.getByRole('textbox', { name: 'Merkinnän teksti', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Leikkaus {mitta} mm');
  await input.press('Enter');
  await expect(dimension.locator('text')).toHaveText('Leikkaus 600 mm');
  const row = page.getByTestId('section-dimension-row-section-dim');
  await row.getByRole('button', { name: 'Piilota dimensio', exact: true }).click();
  await expect(dimension).toHaveCount(0);
  await row.getByRole('button', { name: 'Näytä dimensio', exact: true }).click();
  await expect(dimension.locator('text')).toHaveText('Leikkaus 600 mm');
  const saved = await save(page);
  expect(saved.bodies).toEqual(original.bodies);
  expect(saved.sections?.[0].frame).toEqual(section.frame);
  expect(saved.sections?.[0].dimensions[0]).toMatchObject({
    ...section.dimensions[0],
    label: 'Leikkaus {mitta} mm',
    hidden: false,
  });
});

test('measurement text accepts cancel and reset, and hiding retains an unfinished label in one undo step', async ({
  page,
}) => {
  const original = await setup(page);
  await browserTab(page, 'Viivat');
  const row = page.getByTestId('guide-row-free');
  await row.getByRole('button').first().click();
  const input = page.getByRole('textbox', { name: 'Merkinnän teksti', exact: true });
  await input.fill('Ei tallenneta');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await input.fill('Jako {mitta} mm');
  await page.getByRole('button', { name: 'Piilota merkintä', exact: true }).click();
  let saved = await save(page);
  expect(saved.guides[1]).toEqual({
    ...original.guides[1],
    label: 'Jako {mitta} mm',
    hidden: true,
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(original.guides);
  await browserTab(page, 'Viivat');
  await row.getByRole('button').first().click();
  await input.fill('Uusi nimi');
  await input.press('Enter');
  await expect(page.getByTestId('guide-label').filter({ hasText: 'Uusi nimi' })).toHaveCount(1);
  await input.fill('');
  await input.press('Enter');
  await expect(page.getByTestId('guide-label').filter({ hasText: '200 mm' })).toHaveCount(1);
  saved = await save(page);
  expect(saved.guides).toEqual(original.guides);
  expect(saved.bodies).toEqual(original.bodies);
});
