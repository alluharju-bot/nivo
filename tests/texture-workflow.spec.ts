import { test, expect } from '@playwright/test';
import { ready, save, view, click } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { asComponent } from '../src/model/components';

test('P keeps texture translation, rotation and scale active with one history step per drag', async ({
  page,
}, info) => {
  const body = { ...makeBody(500, 300, 40), appearance: defaultAppearance('pine') };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Tekstuurin asettelu', exact: true }).click();
  await click(page, p(150, 100, 40));
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-texture-editing', body.id);
  const start = p(150, 100, 40),
    end = p(210, 125, 40);
  const builds = await canvas.getAttribute('data-geometry-builds');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-texture-dragging', 'move');
  await page.mouse.up();
  const moved = (await save(page)).bodies[0];
  expect(moved.appearance!.texture.offsetX).toBeCloseTo(60, 4);
  expect(moved.appearance!.texture.offsetY).toBeCloseTo(25, 4);
  expect(moved.feature).toEqual(body.feature);
  await expect(canvas).toHaveAttribute('data-texture-editing', body.id);
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].appearance).toEqual(body.appearance);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  const rotate = await page
    .getByRole('button', { name: 'Kierrä tekstuuria', exact: true })
    .boundingBox();
  await page.mouse.move(rotate!.x + 17, rotate!.y + 17);
  await page.mouse.down();
  await page.mouse.move(rotate!.x, rotate!.y + 75, { steps: 8 });
  await page.mouse.up();
  expect((await save(page)).bodies[0].appearance!.texture.rotation).not.toBe(0);
  const scale = await page
    .getByRole('button', { name: 'Skaalaa tekstuuria', exact: true })
    .boundingBox();
  await page.mouse.move(scale!.x + 17, scale!.y + 17);
  await page.mouse.down();
  await page.mouse.move(scale!.x + 57, scale!.y - 13, { steps: 8 });
  await page.mouse.up();
  expect((await save(page)).bodies[0].appearance!.texture.width).toBeGreaterThan(
    body.appearance.texture.width,
  );
  const width = page.getByLabel('Kuvion leveys (mm)', { exact: true });
  await width.fill('450');
  await width.press('Enter');
  expect((await save(page)).bodies[0].appearance!.texture.width).toBe(450);
  await page.screenshot({ path: info.outputPath('paint-texture.png') });
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-texture-editing', '');
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('selected linked panels get independent, undoable texture origins while tile patterns stay untouched', async ({
  page,
}) => {
  const source = asComponent({ ...makeBody(500, 90, 18), appearance: defaultAppearance('pine') });
  const panels = Array.from({ length: 8 }, (_, i) => ({
    ...source,
    id: `panel-${i}`,
    origin: [0, i * 100, 0] as [number, number, number],
  }));
  const tile = {
    ...makeBody(500, 90, 18, [0, 900, 0]),
    appearance: defaultAppearance('tile-white-gloss'),
  };
  await ready(page, [...panels, tile]);
  const p = await view(page, [...panels, tile]);
  const a = p(-20, -20),
    b = p(520, 800);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Tekstuurin asettelu', exact: true }).click();
  await expect(page.getByText('Vaihtele tekstuuria · 8 osaa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vaihtele valitut tekstuurit', exact: true }).click();
  const varied = await save(page);
  expect(new Set(varied.bodies.slice(0, 8).map((b) => b.appearance!.texture.offsetX)).size).toBe(8);
  for (const [i, part] of varied.bodies.slice(0, 8).entries()) {
    expect(part.appearance!.texture.rotation).toBe(90);
    expect(part.feature).toEqual(panels[i].feature);
    expect(part.component).toEqual(source.component);
    expect(part.localTexture).toBe(true);
    expect(part.localMaterial).toBeUndefined();
  }
  expect(varied.bodies[8]).toEqual(tile);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([...panels, tile]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(varied.bodies);
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  expect((await save(page)).bodies).toEqual(varied.bodies);
});
