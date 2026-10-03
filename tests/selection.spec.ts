import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save, editBody } from './helpers';

test('Shift held at press time adds the object even if released before mouseup', async ({
  page,
}) => {
  const parts = [makeBody(100, 100, 100), makeBody(100, 100, 100, [200, 0, 0])];
  await ready(page, parts);
  const point = await view(page, parts);
  await click(page, point(50, 50, 100));
  await page.mouse.move(point(250, 50, 100).x, point(250, 50, 100).y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.keyboard.up('Shift');
  await page.mouse.up();
  for (const part of parts)
    await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
});

test('Shift toggles ungrouped objects in the viewport and M drags the whole selection', async ({
  page,
}) => {
  const parts = [0, 200, 400].map((x) => makeBody(100, 100, 100, [x, 0, 0]));
  await ready(page, parts);
  const point = await view(page, parts);
  await click(page, point(50, 50, 100));
  await page.keyboard.down('Shift');
  await click(page, point(250, 50, 100));
  await click(page, point(450, 50, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(3);
  await click(page, point(450, 50, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
  await click(page, point(350, 180, 100)); // A Shift-click on empty space preserves the selection.
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('reference-lock')).toHaveCount(0);
  await page.keyboard.press('m');
  const start = point(50, 50, 100),
    end = point(50, 200, 100);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.bodies[0].origin).toEqual([0, 150, 0]);
  expect(result.bodies[1].origin).toEqual([200, 150, 0]);
  expect(result.bodies[2]).toEqual(parts[2]);
  expect(result.groups).toEqual([]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  result = await save(page);
  expect(result.bodies).toEqual(parts);
  await page.keyboard.press('v');
  await click(page, point(450, 50, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByTestId(`body-${parts[2].id}`)).toHaveAttribute('aria-pressed', 'true');
});

for (const side of ['front', 'right'] as const) {
  test(`Shift selection works from ${side} view while edit mode still protects other parts`, async ({
    page,
  }) => {
    const parts = [makeBody(100, 100, 100), makeBody(100, 100, 100, [200, 200, 0])];
    await ready(page, parts);
    const point = await view(page, parts, side);
    const center = (index: number) =>
      point(
        index * 200 + (side === 'front' ? 50 : 100),
        index * 200 + (side === 'front' ? 0 : 50),
        50,
      );
    await click(page, center(0));
    await page.keyboard.down('Shift');
    await click(page, center(1));
    await page.keyboard.up('Shift');
    await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
    await editBody(page, parts[0].id);
    await page.keyboard.down('Shift');
    await click(page, center(1));
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', parts[0].id);
    await expect(page.getByTestId(`body-${parts[1].id}`)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('edit-context-hint')).toBeVisible();
  });
}

test('drag rectangle selects whole objects from any start; Shift adds without toggling and Escape cancels', async ({
  page,
}, info) => {
  const parts = [0, 200, 400].map((x) => makeBody(100, 100, 100, [x, 0, 0]));
  await ready(page, parts);
  const point = await view(page, parts);
  const box = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await expect(page.getByTestId('selection-box')).toBeVisible();
    await page.mouse.up();
  };
  await box(point(-10, 110, 100), point(310, -10, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
  await page.keyboard.down('Shift');
  await box(point(190, 110, 100), point(510, -10, 100));
  await page.keyboard.up('Shift');
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(3);
  // Starting on the first part's face still starts a rectangle and selects the second part.
  await box(point(50, 100, 100), point(310, -10, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByTestId(`body-${parts[1].id}`)).toHaveAttribute('aria-pressed', 'true');
  const a = point(-10, 110, 100),
    b = point(510, -10, 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.screenshot({ path: info.outputPath('rectangle-selection.png') });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('selection-box')).toBeHidden();
  expect((await save(page)).bodies).toEqual(parts);
  // Right-button navigation never opens a selection rectangle.
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await expect(page.getByTestId('selection-box')).toBeHidden();
  await page.mouse.up({ button: 'right' });
});
