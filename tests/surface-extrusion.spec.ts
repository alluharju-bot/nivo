import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, save } from './helpers';

test('offset a flat square, raise its centre, then edit its retained rim and undo/reload', async ({
  page,
}, info) => {
  const body = makeBody(1000, 1000, 0);
  await ready(page, [body]);
  const point = await view(page, [body]);
  const centre = point(500, 500);
  await page.mouse.move(centre.x, centre.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', 'z:max');
  await page.keyboard.press('o');
  await page.getByTestId('offset-input').fill('250');
  await page.getByTestId('offset-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const inset = await save(page);
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('400');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const raised = await save(page);
  expect(raised.bodies).toHaveLength(1);
  expect(raised.bodies[0].origin).toEqual([0, 0, 0]);
  expect(raised.bodies[0].feature).toMatchObject({ width: 1000, depth: 1000, height: 400 });
  // The flat outer rim must still be pickable and extrudable, despite the body
  // now also containing a solid. Its initial thickness is zero, not 400 mm.
  const rim = point(125, 500);
  await page.mouse.click(rim.x, rim.y);
  await expect(page.getByTestId('remaining-input')).toHaveValue('0');
  await page.getByTestId('height-input').fill('100');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const stepped = await save(page);
  expect(stepped.bodies[0].feature).not.toEqual(raised.bodies[0].feature);
  expect(stepped.bodies[0].feature).toMatchObject({ width: 1000, depth: 1000, height: 400 });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  expect((await save(page)).bodies).toEqual(raised.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(inset.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(raised.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(raised.bodies);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('raised-centre-with-flat-rim.png') });
});
