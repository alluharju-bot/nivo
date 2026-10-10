import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, save, revealBrowser } from './helpers';

for (const operation of ['fillet', 'chamfer']) {
  test(`a new ${operation} can target the curved rim of an already semicircular part and undo restores it`, async ({
    page,
  }) => {
    const part = makeBody(20, 60, 8, [0, 0, 0], 'Puolipyöreä osa');
    await ready(page, [part]);
    const point = await view(page, [part]);
    await revealBrowser(page);
    await page.getByTestId(`body-${part.id}`).click();
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Puolipyöreäksi', exact: true }).click();
    await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const rounded = (await save(page)).bodies[0];
    await page.keyboard.press('f');
    const fresh = page.getByRole('button', { name: 'Uusi reunakäsittely', exact: true });
    await expect(fresh).toBeVisible();
    await fresh.click();
    await expect(fresh).toHaveCount(0);
    await page.getByLabel('Reunakäsittely', { exact: true }).selectOption(operation);
    await page.getByTestId('detail-size').fill('1');
    const p = point(10, 60, 8);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('viewport')).toHaveAttribute(
      'data-detail-hover',
      new RegExp(`^${part.id}:`),
    );
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', part.id);
    await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const finished = (await save(page)).bodies[0];
    expect(finished.edgeTreatment).toMatchObject({ operation, size: 1, source: rounded.feature });
    expect(finished.feature).not.toEqual(rounded.feature);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies[0].feature).toEqual(rounded.feature);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies[0]).toEqual(rounded);
  });
}

test('all cylinder edges select only the circular rims and accept a chamfer', async ({ page }) => {
  const cylinder = makeProfileBody(
    { kind: 'circle', radius: 40 },
    sketchFrame([0, 0, 0]),
    20,
    'Sylinteri',
  );
  await ready(page, [cylinder]);
  await view(page, [cylinder]);
  await revealBrowser(page);
  await page.getByTestId(`body-${cylinder.id}`).click();
  // Curved solids retain exact edge snaps without flooding the viewport with point sprites.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-annotation-points', '0');
  await page.keyboard.press('f');
  await page.getByLabel('Reunakäsittely', { exact: true }).selectOption('chamfer');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('1');
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '4 reunaa valittu',
  );
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].edgeTreatment?.operation).toBe('chamfer');
});

test('selected drawing circles retain their visible curve stations', async ({ page }) => {
  const circle = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([0, 0, 0]));
  await ready(page, [circle]);
  await page.getByTestId(`body-${circle.id}`).press('Enter');
  await expect
    .poll(async () =>
      Number(await page.getByTestId('viewport').getAttribute('data-annotation-points')),
    )
    .toBeGreaterThanOrEqual(4);
});
