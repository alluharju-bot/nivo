import { test, expect, type Page } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { guidePoints } from '../src/model/guides';
import { ready, view, click, save } from './helpers';

async function freeMeasure(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ }).click();
}
const snap = (page: Page) => page.getByTestId('viewport');

test('recent rectangle dimensions attract from every direction; Alt and exact input take precedence', async ({
  page,
}, info) => {
  const floor = makeBody(600, 600, 40);
  await ready(page, [floor]);
  const at = await view(page, [floor]);
  await page.keyboard.press('s');
  await click(page, at(100, 100, 40));
  await page.mouse.move(at(170, 150, 40).x, at(170, 150, 40).y);
  await page.keyboard.type('92');
  await page.keyboard.press('Tab');
  await page.keyboard.type('38');
  await page.keyboard.press('Enter');
  await expect(snap(page)).toHaveAttribute('data-mesh-count', '2');
  await page.keyboard.press('s');
  await click(page, at(440, 440, 40));
  await page.mouse.move(at(347, 403, 40).x, at(347, 403, 40).y);
  await expect(page.getByTestId('width-input')).toHaveValue('92');
  await expect(page.getByTestId('depth-input')).toHaveValue('38');
  await expect(page.getByTestId('snap-hint')).toContainText('mittamuisti');
  await page.screenshot({ path: info.outputPath('recent-dimension-snap.png') });
  await page.keyboard.down('Alt');
  await page.mouse.move(at(346.8, 403, 40).x, at(346.8, 403, 40).y);
  await expect(page.getByTestId('width-input')).toHaveValue('90');
  await page.keyboard.up('Alt');
  await page.mouse.move(at(347, 403, 40).x, at(347, 403, 40).y);
  await expect(page.getByTestId('width-input')).toHaveValue('92');
  await page.keyboard.type('96');
  await page.mouse.move(at(347.2, 403, 40).x, at(347.2, 403, 40).y);
  await expect(page.getByTestId('width-input')).toHaveValue('96');
  await page.keyboard.press('Enter');
  await expect(snap(page)).toHaveAttribute('data-mesh-count', '3');
  const result = (await save(page)).bodies[2];
  result.origin.forEach((v, i) => expect(v).toBeCloseTo([344, 402, 40][i], 6));
  expect(result.feature).toMatchObject({ width: 96, depth: 38 });
});

test('pen remembers 98 mm despite 10 mm grid and shares it with a free measurement', async ({
  page,
}) => {
  const floor = makeBody(600, 600, 40);
  await ready(page, [floor]);
  const at = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, at(100, 100, 40));
  await page.mouse.move(at(170, 100, 40).x, at(170, 100, 40).y);
  await page.keyboard.type('98');
  await page.keyboard.press('Enter');
  await page.mouse.move(at(198, 197, 40).x, at(198, 197, 40).y);
  await expect(page.getByTestId('pen-length')).toHaveValue('98');
  await expect(snap(page)).toHaveAttribute('data-snap-key', 'recent-measure');
  await click(page, at(198, 197, 40));
  const points = JSON.parse((await snap(page).getAttribute('data-pen-points'))!);
  expect(points[2]).toEqual([198, 198, 40]);
  await page.keyboard.press('Escape');
  await freeMeasure(page);
  await click(page, at(430, 400, 40));
  await page.mouse.move(at(333, 400, 40).x, at(333, 400, 40).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('98');
  await expect(snap(page)).toHaveAttribute('data-snap-key', 'recent-measure');
  await click(page, at(333, 400, 40));
  await page.keyboard.press('Enter');
  const result = await save(page);
  expect(guidePoints(result.bodies, result.guides[0])).toEqual([
    [430, 400, 40],
    [332, 400, 40],
  ]);
});

test('guide offset is remembered exactly; physical targets and Shift references win', async ({
  page,
}) => {
  const floor = makeBody(600, 600, 40);
  const target = makeBody(20, 20, 40, [95, 360, 40]);
  await ready(page, [floor, target]);
  const at = await view(page, [floor, target]);
  await page.keyboard.press('t');
  await click(page, at(0, 150, 40));
  await page.mouse.move(at(70, 150, 40).x, at(70, 150, 40).y);
  await page.keyboard.type('98');
  await page.keyboard.press('Enter');
  await click(page, at(600, 180, 40));
  await page.mouse.move(at(503, 180, 40).x, at(503, 180, 40).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('98');
  await expect(snap(page)).toHaveAttribute('data-snap-key', 'recent-measure');
  await page.keyboard.press('Escape');
  // Remove the drawn guide so its real intersection cannot mask the test vertex.
  // Recent used dimensions survive Undo; memory itself is not a modeling action.
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await freeMeasure(page);
  await click(page, at(0, 250, 40));
  await page.mouse.move(at(70, 250, 40).x, at(70, 250, 40).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(at(95, 360, 80).x, at(95, 360, 80).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('95');
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  await page.keyboard.up('Shift');
  await expect(snap(page)).not.toHaveAttribute('data-snap-key', 'recent-measure');
});

test('circle diameter memory survives reload within the same project and clears for another project', async ({
  page,
}) => {
  const floor = makeBody(600, 600, 40);
  await ready(page, [floor]);
  let at = await view(page, [floor]);
  await page.keyboard.press('c');
  await click(page, at(150, 150, 40));
  await page.mouse.move(at(180, 150, 40).x, at(180, 150, 40).y);
  await page.keyboard.type('98');
  await page.keyboard.press('Enter');
  await expect(snap(page)).toHaveAttribute('data-mesh-count', '2');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  const model = await save(page);
  await page.reload();
  await expect(snap(page)).toHaveAttribute('data-mesh-count', '2');
  at = await view(page, model.bodies);
  await page.keyboard.press('c');
  await click(page, at(420, 420, 40));
  await page.mouse.move(at(469, 420, 40).x, at(469, 420, 40).y);
  await expect(page.getByTestId('diameter-input')).toHaveValue('98');
  await expect(snap(page)).toHaveAttribute('data-snap-key', 'recent-measure');
  await page.keyboard.press('Escape');
  // Loading a different project must not suggest a previous project's dimensions.
  const { freshProject } = await import('../src/model/project');
  await page.getByTestId('project-file').setInputFiles({
    name: 'another.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies: [floor] })),
  });
  at = await view(page, [floor]);
  await page.keyboard.press('c');
  await click(page, at(420, 420, 40));
  await page.mouse.move(at(469, 420, 40).x, at(469, 420, 40).y);
  await expect(page.getByTestId('diameter-input')).toHaveValue('100');
  await expect(snap(page)).not.toHaveAttribute('data-snap-key', 'recent-measure');
});
