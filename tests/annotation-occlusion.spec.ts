import { test, expect } from '@playwright/test';
import { makeBody, type Guide } from '../src/model/project';
import { ready, view, click, save, revealBrowser } from './helpers';

test('curved geometry hides annotations accurately and reuses its visibility tree while orbiting', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 18);
  const guide: Guide = {
    id: 'inside-ball',
    mode: 'free',
    anchor: { point: [280, 200, 30] },
    endAnchor: { point: [320, 200, 30] },
    direction: [1, 0, 0],
    length: 40,
    plane: 'XY',
    angle: 0,
  };
  await ready(page, [floor], [guide]);
  const p = await view(page, [floor]);
  const label = page.getByTestId('guide-label');
  await expect(label).toBeVisible();
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Pallo', exact: true }).click();
  await click(page, p(300, 200, 18));
  await page.mouse.move(p(350, 200, 18).x, p(350, 200, 18).y);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-mesh-count', '2');
  await expect(label).toBeHidden();
  await expect.poll(async () => Number(await canvas.getAttribute('data-occlusion-builds'))).toBe(1);
  const model = await save(page);
  await page.getByRole('button', { name: 'Valitse', exact: true }).click();
  const r = (await canvas.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(r.x + r.width * 0.55, r.y + r.height * 0.55, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-occlusion-builds', '1');
  await expect(label).toBeHidden();
  await revealBrowser(page);
  await page.getByTestId(`body-${model.bodies[1].id}`).press('Enter');
  await page
    .getByRole('toolbar', { name: 'Näkymän pikatoiminnot' })
    .getByRole('button', { name: 'Ghost', exact: true })
    .click();
  await expect(label).toBeVisible();
  await page
    .getByRole('toolbar', { name: 'Näkymän pikatoiminnot' })
    .getByRole('button', { name: 'Solid', exact: true })
    .click();
  await expect(label).toBeHidden();
  expect((await save(page)).bodies).toEqual(model.bodies);
});
