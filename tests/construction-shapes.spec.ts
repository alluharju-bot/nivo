import { test, expect } from '@playwright/test';
import { makeBody, featureIsSolid } from '../src/model/project';
import { ready, view, click, save, editBody } from './helpers';

test('construction rectangle overlays an edited face without splitting it and remains separately selectable', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 40, [0, 0, 0], 'Kaapin levy');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await editBody(page, body.id);
  await page.keyboard.press('s');
  const actions = page.getByRole('toolbar', { name: 'Muodon toiminnot' });
  await actions.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Muodon paksuus', exact: true })).toBeDisabled();
  await click(page, p(50, 50, 40));
  await page.mouse.move(p(150, 150, 40).x, p(150, 150, 40).y);
  await page.getByTestId('width-input').fill('100');
  await page.getByTestId('depth-input').fill('100');
  await page.getByTestId('depth-input').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  let result = await save(page);
  expect(result.bodies[0]).toEqual(body);
  const outline = result.bodies[1];
  expect(outline.purpose).toBe('construction');
  expect(featureIsSolid(outline.feature)).toBe(false);
  expect(outline.feature.width).toBeCloseTo(100, 5);
  expect(outline.feature.depth).toBeCloseTo(100, 5);
  expect(outline.origin[2]).toBeCloseTo(40, 5);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // Leave the part edit scope after ending the tool.
  // Interior clicks reach the original part; only the outline selects the guide shape.
  await click(page, p(100, 100, 40));
  await expect(page.getByTestId(`body-${body.id}`)).toHaveClass(/selected/);
  await click(page, p(100, 50, 40));
  await expect(page.getByTestId(`body-${outline.id}`)).toHaveClass(/selected/);
  await page.screenshot({ path: info.outputPath('construction-rectangle.png') });
  await page.keyboard.press('t');
  await click(page, p(50, 50, 40));
  await page.mouse.move(p(150, 150, 40).x, p(150, 150, 40).y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Viivan piste');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  // Redo builds the CAD result asynchronously; do not reload while its old
  // model still carries the preceding transaction's saved status.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  result = await save(page);
  expect(result.bodies).toEqual([body, outline]);
});

test('construction circles, ellipses and closed pen shapes share the flat mode on a vertical face', async ({
  page,
}) => {
  const body = makeBody(500, 30, 500, [0, 0, 0], 'Seinä');
  await ready(page, [body]);
  const p = await view(page, [body], 'front');
  await editBody(page, body.id);
  await page.keyboard.press('c');
  const actions = page.getByRole('toolbar', { name: 'Muodon toiminnot' });
  await actions.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }).click();
  await click(page, p(120, 0, 120));
  await click(page, p(160, 0, 120));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  await page.keyboard.press('c');
  await page.getByRole('combobox', { name: 'Muoto', exact: true }).selectOption('ellipse');
  await click(page, p(340, 0, 120));
  await click(page, p(410, 0, 170));
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  await page.keyboard.press('k');
  for (const [x, z] of [
    [80, 320],
    [180, 320],
    [140, 400],
    [80, 320],
  ])
    await click(page, p(x, 0, z));
  await expect(page.locator('.object-list .object-select')).toHaveCount(4);
  let result = await save(page);
  expect(result.bodies[0]).toEqual(body);
  result.bodies.slice(1).forEach((b) => {
    expect(b.purpose).toBe('construction');
    expect(featureIsSolid(b.feature)).toBe(false);
    expect(b.feature.depth).toBeCloseTo(0, 5);
  });
  // Switching back to a normal shape restores the existing surface-edit workflow.
  await page.keyboard.press('s');
  await actions.getByRole('button', { name: 'Kappale', exact: true }).click();
  await click(page, p(300, 0, 320));
  await click(page, p(400, 0, 400));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies).toHaveLength(4);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies.slice(1).every((b) => b.purpose === 'construction')).toBe(true);
});
