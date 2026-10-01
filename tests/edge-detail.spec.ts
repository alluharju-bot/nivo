import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save } from './helpers';

test('picked edges fillet with a preview, exact size and persistent undo', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 40, [0, 0, 0], 'Hylly');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const edge = p(120, 0, 40);
  await page.mouse.move(edge.x, edge.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-hover', /.+:\d+/);
  await click(page, edge);
  await page.getByTestId('detail-size').fill('5');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', body.id);
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '1 reunaa valittu',
  );
  expect((await save(page)).bodies).toEqual([body]);
  await page.screenshot({ path: info.outputPath('fillet-preview.png') });
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].id).toBe(body.id);
  expect(result.bodies[0].feature.width).toBeCloseTo(300);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('all-edge chamfer can be cancelled, rejects oversized cuts, and applies a valid size', async ({
  page,
}) => {
  const body = makeBody(200, 160, 40);
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('combobox', { name: 'Reunakäsittely', exact: true }).selectOption('chamfer');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('1000');
  await expect(page.getByRole('alert')).toContainText('Pienennä');
  expect((await save(page)).bodies).toEqual([body]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('3');
  await expect(
    page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }),
  ).toBeEnabled();
  await page.getByTestId('detail-size').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
});
