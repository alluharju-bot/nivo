import { expect, test } from '@playwright/test';
import { makeBody, isPointDimension } from '../src/model/project';
import { resolveAnchor } from '../src/model/guides';
import { ready, view, save } from './helpers';

test('dimensions can anchor to held parts and inherited locks without editing their reference data', async ({
  page,
}) => {
  const a = { ...makeBody(600, 400, 20), locked: true };
  const b = { ...makeBody(400, 400, 20, [900, 0, 0]), groupId: 'held' };
  await ready(page, [a, b], [], [{ id: 'held', name: 'Lukittu', locked: true, hidden: false }]);
  const p = await view(page, [a, b]);
  const before = await save(page);
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Dimensio/ }).click();
  // First endpoint is a free surface reference, the second a snapped corner.
  for (const point of [p(200, 150, 20), p(900, 0, 20), p(700, -140, 20)])
    await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('button', { name: 'Toimintohistoria' })).toContainText(
    'Dimensio tallennettu.',
  );
  const saved = await save(page);
  expect(saved.bodies).toEqual(before.bodies);
  expect(saved.groups).toEqual(before.groups);
  expect(saved.dimensions).toHaveLength(1);
  const d = saved.dimensions[0];
  if (!isPointDimension(d)) throw Error('Expected point dimension');
  expect(d.start).toMatchObject({ bodyId: a.id, key: expect.stringMatching(/^reference:/) });
  expect(resolveAnchor(saved.bodies, d.start)![2]).toBeCloseTo(20);
  expect(resolveAnchor(saved.bodies, d.end)).toEqual([900, 0, 20]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).dimensions).toHaveLength(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('dimension-3d')).not.toHaveClass(/broken/);
});

test('model highlight draws without text, edits its border, moves, hides and reaches the drawing', async ({
  page,
}, info) => {
  const body = { ...makeBody(1000, 800, 20), locked: true };
  await ready(page, [body]);
  const p = await view(page, [body]);
  const before = await save(page);
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Huomautus/ }).click();
  await page.getByRole('combobox', { name: 'Huomautuksen tyyppi' }).selectOption('highlight');
  const a = p(200, 200, 20),
    b = p(800, 600, 20);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('region', { name: 'Korostusalueen asetukset' })).toBeVisible();
  const outline = page.locator('.model-markups .highlight-outline');
  await expect(outline).toHaveAttribute('fill-opacity', '0');
  await expect(page.locator('.model-markups .markup-label')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Korostuksen reunatyyli' }).selectOption('dashed');
  await expect(outline).toHaveAttribute('stroke-dasharray', '8 4');
  const color = page.getByLabel('Reunan väri', { exact: true });
  await color.evaluate((node: HTMLInputElement) => {
    node.value = '#8844cc';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(outline).toHaveAttribute('stroke', '#8844cc');
  await color.dispatchEvent('change');
  await page
    .getByRole('region', { name: 'Korostusalueen asetukset' })
    .getByRole('button', { name: 'Piilota merkintä', exact: true })
    .click();
  await expect(outline).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Korostusalueen asetukset' })
    .getByRole('button', { name: 'Näytä merkintä', exact: true })
    .click();
  await expect(outline).toHaveCount(1);
  const original = (await save(page)).annotations![0];
  await page.keyboard.press('Escape');
  const edge = await outline.evaluate((node) => {
    const p = (node as SVGPathElement)
      .getPointAtLength(80)
      .matrixTransform((node as SVGPathElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 30, edge.y, { steps: 4 });
  await page.mouse.up();
  const moved = await save(page);
  expect(moved.bodies).toEqual(before.bodies);
  expect(moved.annotations![0]).toMatchObject({
    kind: 'highlight',
    color: '#8844cc',
    lineStyle: 'dashed',
  });
  expect(moved.annotations![0]).not.toEqual(original);
  await page.screenshot({ path: info.outputPath('model-highlight.png') });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByLabel('Projektion suunta', { exact: true }).selectOption('top');
  await expect(page.locator('.drawing-paper .highlight-outline')).toHaveAttribute(
    'stroke',
    '#8844cc',
  );
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(outline).toHaveAttribute('stroke', '#8844cc');
});

test('paper highlight has editable border and transparent interior with save and undo', async ({
  page,
}) => {
  await ready(page, [makeBody()]);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  await page.getByRole('button', { name: 'Korosta alue', exact: true }).click();
  const box = (await page.locator('.drawing-paper svg').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  const outline = page.locator('.drawing-paper [data-paper-annotation] > rect').first();
  await expect(outline).toHaveAttribute('fill-opacity', '0');
  await page.getByRole('combobox', { name: 'Korostuksen reunatyyli' }).selectOption('dotted');
  await expect(outline).toHaveAttribute('stroke-dasharray', '0.25 1');
  const color = page.getByLabel('Arkkimerkinnän väri', { exact: true });
  await color.evaluate((node: HTMLInputElement) => {
    node.value = '#2266aa';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(outline).toHaveAttribute('stroke', '#2266aa');
  expect((await save(page)).drawingAnnotations![0].color).toBe('#b18b35');
  await color.dispatchEvent('change');
  expect((await save(page)).drawingAnnotations![0].color).toBe('#2266aa');
  await page.getByRole('checkbox', { name: 'Kevyt taustaväri' }).check();
  await expect(outline).toHaveAttribute('fill-opacity', '0.12');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(outline).toHaveAttribute('fill-opacity', '0');
  const saved = await save(page);
  expect(saved.drawingAnnotations![0]).toMatchObject({
    kind: 'highlight',
    text: '',
    lineStyle: 'dotted',
    fillOpacity: 0,
    color: '#2266aa',
  });
});
