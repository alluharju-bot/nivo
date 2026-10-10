import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody, type Vec3 } from '../src/model/project';
import { sketchFrame, fromUV } from '../src/model/sketch';
import { ready, view, click, save } from './helpers';

test('typing width, Tab and depth keeps the first rectangle corner in the negative quadrant', async ({
  page,
}, info) => {
  const floor = makeBody(600, 600, 40);
  await ready(page, [floor]);
  const at = await view(page, [floor]);
  await page.keyboard.press('s');
  await click(page, at(400, 400, 40));
  await page.mouse.move(at(190, 270, 40).x, at(190, 270, 40).y);
  await expect(page.getByTestId('width-input')).toHaveValue('210');
  await expect(page.getByTestId('depth-input')).toHaveValue('130');
  await page.keyboard.type('92');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('depth-input')).toBeFocused();
  await page.keyboard.type('38');
  await page.screenshot({ path: info.outputPath('typed-rectangle-preview.png') });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies[0]).toEqual(floor);
  const part = result.bodies[1];
  const expected: Vec3 = [308, 362, 40];
  part.origin.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 7));
  expect(part.feature).toMatchObject({ width: 92, depth: 38, height: 0 });
});

for (const { name, normal, side, signs } of [
  { name: 'positive XY', normal: [0, 0, 1], side: 'top', signs: [1, 1] },
  { name: 'positive X, negative Y', normal: [0, 0, 1], side: 'top', signs: [1, -1] },
  { name: 'negative X, positive Y', normal: [0, 0, 1], side: 'top', signs: [-1, 1] },
  { name: 'vertical front face', normal: [0, -1, 0], side: 'front', signs: [-1, -1] },
  { name: 'vertical side face', normal: [1, 0, 0], side: 'right', signs: [-1, -1] },
  { name: 'sloping face', normal: [0, -0.6, 0.8], side: 'top', signs: [-1, -1] },
] as const) {
  test(`rectangle numeric resizing preserves its first corner on ${name}`, async ({ page }) => {
    const frame = sketchFrame([-120, -80, -60], [...normal]);
    const surface = makeProfileBody({ kind: 'rectangle', width: 600, depth: 600 }, frame);
    await ready(page, [surface]);
    const at = await view(page, [surface], side);
    const start = fromUV([300, 300], frame);
    const end = fromUV([300 + signs[0] * 210, 300 + signs[1] * 130], frame);
    await page.keyboard.press('s');
    await click(page, at(...start));
    const pointer = at(...end);
    await page.mouse.move(pointer.x, pointer.y);
    await expect(page.getByTestId('width-input')).toHaveValue('210');
    await expect(page.getByTestId('depth-input')).toHaveValue('130');
    // Enlarge one side, shrink the other, then return with Shift+Tab to correct it.
    await page.keyboard.type('310');
    await page.keyboard.press('Tab');
    await page.keyboard.type('78');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('width-input')).toBeFocused();
    await page.keyboard.type('123');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
    const model = await save(page);
    const expected = makeProfileBody(
      { kind: 'rectangle', width: 123, depth: 78 },
      {
        ...frame,
        origin: fromUV([signs[0] < 0 ? -123 : 0, signs[1] < 0 ? -78 : 0], {
          ...frame,
          origin: start,
        }),
      },
    );
    expect(model.bodies[0]).toEqual(surface);
    const result = model.bodies[1];
    result.origin.forEach((n, i) => expect(n).toBeCloseTo(expected.origin[i], 6));
    for (const key of ['width', 'depth', 'height'] as const)
      expect(result.feature[key]).toBeCloseTo(expected.feature[key], 6);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([surface]);
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
    expect((await save(page)).bodies).toEqual(model.bodies);
  });
}

test('mouse-edited dimensions recover after clearing a field and a cancelled drawing does not move the next start', async ({
  page,
}) => {
  const floor = makeBody(600, 600, 40);
  await ready(page, [floor]);
  const at = await view(page, [floor]);
  await page.keyboard.press('s');
  await click(page, at(400, 400, 40));
  const end = at(190, 270, 40);
  await page.mouse.move(end.x, end.y);
  const width = page.getByTestId('width-input');
  const depth = page.getByTestId('depth-input');
  await width.click();
  await page.keyboard.type('92');
  await depth.click();
  await page.keyboard.press('Backspace');
  await expect(depth).toHaveValue('');
  await page.keyboard.type('38');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const first = (await save(page)).bodies[1];
  first.origin.forEach((n, i) => expect(n).toBeCloseTo([308, 362, 40][i], 7));

  await page.keyboard.press('s');
  await click(page, at(500, 500, 40));
  await page.mouse.move(end.x, end.y);
  await page.keyboard.type('99');
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await click(page, at(100, 100, 40));
  // No drag on the new shape: positive dimensions grow from the new first click.
  await page.keyboard.type('66');
  await page.keyboard.press('Tab');
  await page.keyboard.type('38');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const result = await save(page);
  expect(result.bodies.slice(0, 2)).toEqual([floor, first]);
  result.bodies[2].origin.forEach((n, i) => expect(n).toBeCloseTo([100, 100, 40][i], 7));
  expect(result.bodies[2].feature).toMatchObject({ width: 66, depth: 38, height: 0 });
});
