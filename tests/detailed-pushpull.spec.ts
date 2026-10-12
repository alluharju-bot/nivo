import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save, revealBrowser } from './helpers';

test('Push/Pull resizes a rounded board and retains the treatment through undo, redo and reload', async ({
  page,
}) => {
  const body = makeBody(180, 120, 18);
  await ready(page, [body]);
  await view(page, [body]);
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('2');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '2');
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const rounded = (await save(page)).bodies[0];
  expect(rounded.edgeTreatment?.indices).toHaveLength(12);
  const p = await view(page, [rounded]);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('e');
  await click(page, p(90, 60, 18));
  await page.getByTestId('height-input').fill('-5');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const resized = (await save(page)).bodies[0];
  expect(resized.feature.height).toBeCloseTo(13, 5);
  expect(resized.edgeTreatment).toMatchObject({
    id: rounded.edgeTreatment!.id,
    operation: 'fillet',
    size: 2,
  });
  expect(resized.edgeTreatment!.indices).toHaveLength(12);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(rounded);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(resized);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies[0]).toEqual(resized);
});
