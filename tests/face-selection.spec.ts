import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, view, editBody, save, click } from './helpers';

test('explicit face selection is persistent and distinct from hover and direct E/O targets', async ({
  page,
}, info) => {
  const part = {
    ...makeBody(300, 240, 80),
    color: '#19202c',
    appearance: defaultAppearance('chrome'),
  };
  await ready(page, [part]);
  const p = await view(page, [part]);
  const top = p(150, 120, 80),
    canvas = page.getByTestId('viewport');
  await page.mouse.move(top.x, top.y);
  await expect(canvas).toHaveAttribute('data-face-feedback', 'hover');
  await expect(canvas).toHaveAttribute('data-selected-face', '');
  await page.keyboard.press('e');
  await expect(canvas).toHaveAttribute('data-face-feedback', 'push-pull');
  await expect(canvas).toHaveAttribute('data-selected-face', '');
  await page.screenshot({ path: info.outputPath('tool-target.png') });
  await page.keyboard.press('v');
  await editBody(page, part.id);
  const builds = await canvas.getAttribute('data-geometry-builds');
  await click(page, top);
  await expect(canvas).toHaveAttribute('data-selected-face', 'z:max');
  await expect(page.getByTestId('face-selection-indicator')).toBeVisible();
  await page.mouse.move(top.x + 3, top.y);
  await expect(canvas).toHaveAttribute('data-face-feedback', 'selected');
  await page.screenshot({ path: info.outputPath('selected-face.png') });
  await page.mouse.move(8, 8);
  await expect(canvas).toHaveAttribute('data-selected-face', 'z:max');
  // Toolbar activation also uses the selected face with the pointer off the model.
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-tool-face', `${part.id}:z:max`);
  await expect(page.getByTestId('offset-input')).toBeVisible();
  await page.keyboard.press('v');
  await expect(canvas).toHaveAttribute('data-selected-face', 'z:max');
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  expect((await save(page)).bodies).toEqual([part]);
});

test('selected top face stays the E/O target when the pointer moves onto the front face; Shift still picks depth', async ({
  page,
}) => {
  const part = makeBody(300, 240, 80),
    reference = { ...makeBody(60, 100, 120, [350, 0, 0]), locked: true };
  await ready(page, [part, reference]);
  await editBody(page, part.id);
  const top = await view(page, [part]);
  await click(page, top(150, 120, 80));
  const front = await view(page, [part], 'front'),
    f = front(150, 0, 40),
    canvas = page.getByTestId('viewport');
  await page.mouse.move(f.x, f.y);
  await expect(canvas).toHaveAttribute('data-hover-face', 'y:min');
  await page.keyboard.press('o');
  await expect(canvas).toHaveAttribute('data-tool-face', `${part.id}:z:max`);
  await page.keyboard.press('v');
  await page.mouse.move(f.x + 2, f.y);
  await page.keyboard.press('e');
  await expect(canvas).toHaveAttribute('data-tool-face', `${part.id}:z:max`);
  await expect(page.getByTestId('remaining-input')).toHaveValue('80');
  // Starting the drag over another surface must still use the explicitly selected top.
  await page.mouse.down();
  await page.mouse.move(f.x, f.y - 12, { steps: 3 });
  await expect(canvas).toHaveAttribute('data-tool-face', `${part.id}:z:max`);
  await page.keyboard.down('Shift');
  const target = front(380, 0, 120);
  await page.mouse.move(target.x, target.y, { steps: 3 });
  await expect(page.getByTestId('height-input')).toHaveValue('+40');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const changed = await save(page);
  expect(changed.bodies[0].feature.height).toBe(120);
  expect(changed.bodies[0].feature.depth).toBe(240);
  expect(changed.bodies[1]).toEqual(reference);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([part, reference]);
});
