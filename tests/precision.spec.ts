import { test, expect } from '@playwright/test';
import { makeBody, freshProject, type Guide, type PointDimension } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, view, click, save, revealBrowser } from './helpers';

test('move ignores guides attached to the moving part but still snaps to fixed guides', async ({
  page,
}) => {
  const a = makeBody(60, 60, 20),
    b = makeBody(100, 100, 20, [400, 350, 0]);
  const attached: Guide = {
    id: 'own-guide',
    mode: 'guide',
    anchor: { bodyId: a.id, key: 'corner:0', local: [0, 0, 0] },
    offset: [0, 153, 20],
    direction: [1, 0, 0],
    plane: 'XY',
    angle: 0,
    length: 500,
  };
  const fixed: Guide = {
    id: 'fixed-guide',
    mode: 'guide',
    anchor: { point: [0, 303, 20] },
    direction: [1, 0, 0],
    plane: 'XY',
    angle: 0,
    length: 500,
  };
  await ready(page, [a, b], [attached, fixed]);
  const p = await view(page, [a, b]);
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.keyboard.press('m');
  await page
    .locator('summary')
    .filter({ hasText: /^Siirtotapa$/ })
    .click();
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  await page.mouse.move(p(60, 60, 20).x, p(60, 60, 20).y);
  await page.mouse.down();
  await page.mouse.move(p(233, 154, 20).x, p(233, 154, 20).y, { steps: 6 });
  await expect(page.getByTestId('snap-hint')).toContainText('Siirtymä · 10 mm');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].origin).toEqual([170, 90, 0]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  // Undo's viewport update completes asynchronously. Wait for the returned
  // corner to be pickable before starting another drag (not an empty marquee).
  await expect
    .poll(async () => {
      const start = p(60, 60, 20);
      await page.mouse.move(start.x + 1, start.y);
      await page.mouse.move(start.x, start.y);
      return page.getByTestId('viewport').getAttribute('data-move-hovered');
    })
    .toBe(JSON.stringify([a.id]));
  await page.mouse.down();
  await page.mouse.move(p(253, 304, 20).x, p(253, 304, 20).y, { steps: 6 });
  await expect(page.getByTestId('snap-hint')).toContainText('Tartunta · Apuviiva');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].origin[1]).toBeCloseTo(243, 6);
});

test('an invisible dimension label cannot steal object selection', async ({ page }) => {
  const a = makeBody(100, 60, 20),
    b = makeBody(100, 100, 20, [0, 100, 0]);
  const dimension: PointDimension = {
    id: 'only-selected',
    kind: 'points',
    start: { bodyId: a.id, key: 'corner:0', local: [0, 0, 0] },
    end: { bodyId: a.id, key: 'corner:4', local: [100, 0, 0] },
    fallback: [
      [0, 0, 0],
      [100, 0, 0],
    ],
    axis: 'distance',
    offset: [0, 150, 20],
    normal: [0, 0, 1],
  };
  const project = freshProject();
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'dimensions.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...project,
        bodies: [a, b],
        dimensions: [dimension],
        settings: { ...project.settings, dimensionDisplay: 'selected' },
      }),
    ),
  });
  await expect(page.getByTestId(`body-${b.id}`)).toBeVisible();
  const p = await view(page, [a, b]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
  await click(page, p(50, 150, 20));
  await expect(page.getByTestId(`body-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
  expect((await save(page)).dimensions).toEqual([dimension]);
});

test('an imported texture resets its aspect, accepts negative typing and stays independent on a copy', async ({
  page,
}) => {
  await ready(page);
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 16;
    const context = c.getContext('2d')!;
    context.fillStyle = '#bb5533';
    context.fillRect(0, 0, 16, 16);
    context.fillStyle = '#33bb88';
    context.fillRect(16, 0, 16, 16);
    return c.toDataURL();
  });
  const a = {
    ...makeBody(300, 200, 40),
    appearance: { ...defaultAppearance('paint'), assetId: 'picture' },
  };
  await page.getByTestId('project-file').setInputFiles({
    name: 'texture.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [a],
        assets: {
          picture: { name: 'kuva.png', dataUrl, width: 32, height: 16 },
        },
      }),
    ),
  });
  await expect(page.getByTestId(`body-${a.id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('combobox', { name: 'Materiaalin kohde', exact: true }).selectOption(a.id);
  await page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true }).click();
  await page.getByRole('button', { name: 'Palauta sijoittelu', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Kuvion korkeus', exact: true })).toHaveValue(
    '150',
  );
  const shift = page.getByRole('spinbutton', {
    name: 'Siirtymä U',
    exact: true,
  });
  await shift.fill('');
  await shift.pressSequentially('-25.5');
  await expect(shift).toHaveValue('-25.5');
  await page.getByRole('button', { name: 'Hyväksy tekstuuri · Enter', exact: true }).click();
  await page.keyboard.press('Escape');
  await page
    .locator('summary')
    .filter({ hasText: /^Tallenna oma materiaali$/ })
    .click();
  await page.getByRole('textbox', { name: 'Oman materiaalin nimi', exact: true }).fill('Oma kuvio');
  await page
    .getByRole('button', {
      name: 'Tallenna materiaali projektiin',
      exact: true,
    })
    .click();
  const saved = await save(page);
  expect(saved.materials).toHaveLength(1);
  expect(saved.bodies[0].appearance?.texture.offsetX).toBe(-25.5);
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true }).check();
  await page.getByTestId('move-x').fill('400');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const copied = await save(page),
    copy = copied.bodies[1];
  expect(copy.appearance).toEqual(saved.bodies[0].appearance);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Materiaalin kohde', exact: true })
    .selectOption(copy.id);
  await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption('steel');
  await page
    .getByRole('combobox', { name: 'Materiaali', exact: true })
    .selectOption(`custom:${saved.materials![0].id}`);
  await page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Siirtymä U', exact: true }).fill('123');
  await page.getByRole('button', { name: 'Hyväksy tekstuuri · Enter', exact: true }).click();
  const result = await save(page);
  expect(result.bodies[0].appearance).toEqual(saved.bodies[0].appearance);
  expect(result.bodies[1].appearance?.texture.offsetX).toBe(123);
  expect(result.assets).toEqual(saved.assets);
  expect(result.materials).toEqual(saved.materials);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  const restored = await save(page);
  expect(restored.bodies).toEqual(result.bodies);
  expect(restored.materials).toEqual(result.materials);
  expect(restored.assets).toEqual(result.assets);
});
