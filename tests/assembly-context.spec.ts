import { test, expect, type Locator } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { asComponent } from '../src/model/components';
import { ready, view, click, save, revealBrowser } from './helpers';

test('browser opener stays under the pointer during reveal and touch lifts keep the list available', async ({
  page,
}, info) => {
  const body = makeBody(100, 100, 20);
  await ready(page, [body]);
  const press = (locator: Locator) => (info.project.use.hasTouch ? locator.tap() : locator.click());
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  const opener = page.getByRole('button', { name: 'Näytä mallilista', exact: true });
  for (let i = 0; i < 5; i++) {
    await press(page.getByRole('button', { name: 'Piilota mallilista', exact: true }));
    await expect(browser).toHaveAttribute('data-expanded', 'false');
    const before = (await opener.boundingBox())!;
    if (!info.project.use.hasTouch) {
      await opener.hover();
      await expect(browser).toHaveAttribute('data-expanded', 'true');
      expect(await opener.boundingBox()).toEqual(before);
    }
    await press(opener);
    await expect(browser).toHaveAttribute('data-expanded', 'true');
    await press(page.getByTestId(`body-${body.id}`));
    await expect(page.getByTestId(`body-${body.id}`)).toHaveAttribute('aria-pressed', 'true');
  }
  // Deliberately exceed the 650 ms mouse-leave delay; lifting a finger must not hide the list.
  await page.waitForTimeout(800);
  await expect(browser).toHaveAttribute('data-expanded', 'true');
  expect((await save(page)).bodies).toEqual([body]);
});

test('part rows open a visible assembly context, while viewport clicks select the whole assembly', async ({
  page,
}, info) => {
  const a = { ...makeBody(100, 100, 20, [0, 0, 0], 'Vasen levy'), groupId: 'cabinet' },
    b = { ...makeBody(100, 100, 20, [180, 0, 0], 'Oikea levy'), groupId: 'cabinet' };
  await ready(
    page,
    [a, b],
    [],
    [
      { id: 'row', name: 'Kaappirivistö', kind: 'folder', hidden: false },
      { id: 'cabinet', name: 'Kaappi', kind: 'assembly', parentId: 'row', hidden: false },
    ],
  );
  const press = (locator: Locator) => (info.project.use.hasTouch ? locator.tap() : locator.click());
  const p = await view(page, [a, b]);
  await click(page, p(50, 50, 20));
  await expect(page.getByTestId(`body-${a.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('assembly-context')).toHaveCount(0);
  await press(page.getByRole('button', { name: 'Muokkaa osia', exact: true }));
  await expect(page.getByTestId('assembly-context')).toContainText('Kaappirivistö › Kaappi');
  await press(page.getByRole('button', { name: 'Sulje kokoonpano', exact: true }));
  await revealBrowser(page);
  await press(page.getByTestId(`body-${a.id}`));
  await expect(page.getByTestId('assembly-context')).toContainText('Kaappirivistö › Kaappi');
  await expect(page.getByTestId(`body-${b.id}`)).toHaveAttribute('aria-pressed', 'false');
  await press(page.getByRole('button', { name: 'Muokkaa osaa', exact: true }));
  await expect(page.getByTestId('edit-context')).toContainText('Vasen levy');
  await expect(page.getByTestId('edit-context')).toContainText('Kaappirivistö › Kaappi');
  await press(page.getByRole('button', { name: 'Piilota mallilista', exact: true }));
  await press(page.getByRole('button', { name: 'Näytä mallilista', exact: true }));
  await expect(page.getByRole('complementary', { name: 'Mallilista' })).toHaveAttribute(
    'data-expanded',
    'true',
  );
  await expect(page.getByTestId('edit-context')).toContainText('Vasen levy');
  await page.screenshot({ path: info.outputPath('assembly-edit-path.png') });
  await press(page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }));
  await expect(page.getByTestId('assembly-context')).toBeVisible();
  expect((await save(page)).bodies).toEqual([a, b]);
});

test('linked editing shows its impact and an explicit unique action preserves other copies', async ({
  page,
}, info) => {
  const a = asComponent(makeBody(100, 100, 20, [0, 0, 0], 'Ovi'));
  const b = {
    ...a,
    id: 'second',
    name: 'Toinen ovi',
    origin: [180, 0, 0] as [number, number, number],
  };
  await ready(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  const notice = page.getByTestId('component-link-notice');
  await expect(notice).toContainText('2 linkitettyä osaa');
  await expect(notice).toContainText('Muodon muokkaus päivittyy kaikkiin');
  const unique = page.getByRole('button', { name: 'Muokkaa vain tätä · tee uniikki', exact: true });
  if (info.project.use.hasTouch) await unique.tap();
  else await unique.click();
  await expect(notice).toHaveCount(0);
  let p = await save(page);
  expect(p.bodies[0].component).toBeUndefined();
  expect(p.bodies[1]).toEqual(b);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(notice).toContainText('2 linkitettyä osaa');
  const point = await view(page, [a, b]);
  await page.mouse.move(point(50, 50, 20).x, point(50, 50, 20).y);
  await page.keyboard.press('e');
  await expect(notice).toContainText('2 linkitettyä osaa');
  await page.getByTestId('height-input').fill('10');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  p = await save(page);
  expect(p.bodies.map((b) => b.feature.height)).toEqual([30, 30]);
});
