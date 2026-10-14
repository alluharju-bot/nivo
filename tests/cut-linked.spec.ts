import { expect, test, type Page } from '@playwright/test';
import { asComponent } from '../src/model/components';
import { makeBody, type Body } from '../src/model/project';
import { ready, save, view } from './helpers';

const prompt = (page: Page) =>
  page.getByRole('dialog', { name: 'Linkitettyjen kohteiden leikkaus', exact: true });

async function selectCut(page: Page, targets: Body[], cutter: Body) {
  await page.getByRole('button', { name: 'Muotoile', exact: true }).click();
  for (const body of targets)
    await page.getByRole('checkbox', { name: `Kohde: ${body.name}`, exact: true }).check();
  // Tab must work after choosing a target checkbox as well as in the viewport.
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: `Työstökappale: ${cutter.name}`, exact: true }).check();
}

test('linked Cut keeps selections, makes only targets unique and undoes unlinking and cutting together', async ({
  page,
}, info) => {
  const a = asComponent(makeBody(100, 100, 20, [0, 0, 0], 'Vasen'));
  const b: Body = { ...a, id: 'right', name: 'Oikea', origin: [200, 0, 0] };
  const outside: Body = {
    ...a,
    id: 'outside',
    name: 'Muu kopio',
    origin: [400, 0, 0],
    locked: true,
  };
  const cutter = asComponent(makeBody(180, 120, 40, [60, -10, -10], 'Leikkuri'));
  const cutterCopy: Body = {
    ...cutter,
    id: 'tool-copy',
    name: 'Leikkurin kopio',
    origin: [800, 0, 0],
  };
  await ready(page, [a, b, outside, cutter, cutterCopy]);
  const before = await save(page);
  await selectCut(page, [a, b], cutter);
  await page.getByRole('checkbox', { name: 'Säilytä työstökappaleet', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(prompt(page)).toContainText('Tehdäänkö leikattavista kappaleista uniikkeja?');
  await prompt(page).screenshot({ path: info.outputPath('linked-cut-choice.png') });
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toBeHidden();
  for (const body of [a, b])
    await expect(
      page.getByRole('checkbox', { name: `Kohde: ${body.name}`, exact: true }),
    ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Työstökappale: Leikkuri', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await prompt(page)
    .getByRole('button', { name: 'Tee uniikeiksi ja leikkaa', exact: true })
    .click();
  await expect(prompt(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  await page.keyboard.press('v');
  const after = await save(page);
  for (const [id, x] of [
    [a.id, 0],
    [b.id, 240],
  ] as const) {
    const part = after.bodies.find((body) => body.id === id)!;
    expect(part.component).toBeUndefined();
    expect(part.feature.type).toBe('brep');
    expect(part.feature.width).toBeCloseTo(60, 5);
    expect(part.origin[0]).toBeCloseTo(x, 5);
  }
  expect(after.bodies.some((body) => body.id === cutter.id)).toBe(false);
  for (const id of [outside.id, cutterCopy.id])
    expect(after.bodies.find((body) => body.id === id)).toEqual(
      before.bodies.find((body) => body.id === id),
    );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(after.bodies);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  expect((await save(page)).bodies).toEqual(after.bodies);
});

test('cancelling an in-flight unique Cut keeps the links and selections ready to retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    let pending = true;
    Worker.prototype.postMessage = function (message, transfer) {
      // Hold one real CAD request so cancellation is tested before any result.
      if (message.type === 'boolean' && pending) {
        pending = false;
        return;
      }
      return Reflect.apply(send, this, [message, transfer]);
    };
  });
  const a = asComponent(makeBody(100, 100, 20, [0, 0, 0], 'Kohde'));
  const b: Body = { ...a, id: 'copy', name: 'Kopio', origin: [200, 0, 0] };
  const cutter = makeBody(180, 120, 40, [60, -10, -10], 'Leikkuri');
  await ready(page, [a, b, cutter]);
  const before = await save(page);
  await selectCut(page, [a, b], cutter);
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await prompt(page)
    .getByRole('button', { name: 'Tee uniikeiksi ja leikkaa', exact: true })
    .click();
  await expect(
    prompt(page).getByRole('button', { name: 'Keskeytä laskenta', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toBeHidden();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await expect(page.getByRole('button', { name: 'Kohteet 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Työstökappaleet 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await prompt(page)
    .getByRole('button', { name: 'Tee uniikeiksi ja leikkaa', exact: true })
    .click();
  await expect(prompt(page)).toBeHidden();
  await page.keyboard.press('v');
  for (const body of (await save(page)).bodies.filter((body) => body.id !== cutter.id)) {
    expect(body.component).toBeUndefined();
    expect(body.feature.width).toBeCloseTo(60, 5);
  }
});

test('keeping links still shares a cut with other copies and retains the cutter', async ({
  page,
}) => {
  const a = asComponent(makeBody(100, 100, 20, [0, 0, 0], 'Kohde'));
  const b: Body = { ...a, id: 'copy', name: 'Kopio', origin: [200, 0, 0] };
  const cutter = makeBody(80, 120, 40, [60, -10, -10], 'Leikkuri');
  await ready(page, [a, b, cutter]);
  const before = await save(page);
  await selectCut(page, [a], cutter);
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await prompt(page)
    .getByRole('button', { name: 'Säilytä linkitys ja leikkaa', exact: true })
    .click();
  await expect(prompt(page)).toBeHidden();
  await page.keyboard.press('v');
  const after = await save(page);
  for (const id of [a.id, b.id]) {
    const part = after.bodies.find((body) => body.id === id)!;
    expect(part.component?.id).toBe(a.component!.id);
    expect(part.feature.width).toBeCloseTo(60, 5);
  }
  expect(after.bodies.find((body) => body.id === cutter.id)).toEqual(
    before.bodies.find((body) => body.id === cutter.id),
  );
});

for (const held of [false, true])
  test(`failed unique Cut leaves links and geometry unchanged (${held ? 'held target' : 'missed cutter'})`, async ({
    page,
  }) => {
    const a = asComponent({ ...makeBody(100, 100, 20, [0, 0, 0], 'Kohde'), locked: held });
    const b: Body = { ...a, id: 'copy', name: 'Kopio', origin: [200, 0, 0] };
    const cutter = makeBody(80, 120, 40, [held ? 60 : 1000, -10, -10], 'Leikkuri');
    await ready(page, [a, b, cutter]);
    const before = await save(page);
    await selectCut(page, [a, b], cutter);
    await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
    await prompt(page)
      .getByRole('button', { name: 'Tee uniikeiksi ja leikkaa', exact: true })
      .click();
    await expect(prompt(page).getByRole('alert')).toContainText(
      held ? 'kiinnitetty' : 'eivät leikkaa',
    );
    await prompt(page).getByRole('button', { name: 'Takaisin valintoihin', exact: true }).click();
    for (const body of [a, b])
      await expect(
        page.getByRole('checkbox', { name: `Kohde: ${body.name}`, exact: true }),
      ).toBeChecked();
    expect((await save(page)).bodies).toEqual(before.bodies);
  });

test('Tab switches viewport Cut picking in both directions but leaves the operation select alone', async ({
  page,
}) => {
  const a = makeBody(100, 100, 20, [0, 0, 0], 'Kohde');
  const cutter = makeBody(80, 100, 30, [200, 0, 0], 'Leikkuri');
  await ready(page, [a, cutter]);
  const at = await view(page, [a, cutter]);
  await page.keyboard.press('b');
  await page.mouse.click(at(50, 50, 20).x, at(50, 50, 20).y);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(at(240, 50, 30).x, at(240, 50, 30).y);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Kohteet 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('checkbox', { name: 'Työstökappale: Leikkuri', exact: true }),
  ).toBeChecked();
  await page.getByRole('combobox', { name: 'Toiminto', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Kohteet 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
