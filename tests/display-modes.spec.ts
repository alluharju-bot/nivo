import { test, expect, type Page } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { resolveAnchor } from '../src/model/guides';
import { ready, view, click, save, revealBrowser } from './helpers';

const modes = (page: Page) =>
  page
    .getByTestId('viewport')
    .getAttribute('data-display-modes')
    .then((value) => JSON.parse(value!));
const displayButton = (page: Page, name: string) =>
  page
    .getByRole('toolbar', { name: 'Näkymän pikatoiminnot' })
    .getByRole('button', { name, exact: true });

test('ghost clicks and box selection pass through, but measurements keep exact ghost anchors', async ({
  page,
}, info) => {
  const front = makeBody(600, 18, 600, [0, 0, 0], 'Haamuseinä');
  const back = makeBody(200, 80, 200, [100, 80, 100], 'Seinän takana');
  const bodies = [front, back];
  await ready(page, bodies);
  const p = await view(page, bodies, 'front');
  await click(page, p(40, 0, 200));
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'true');
  const geometryBuilds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.keyboard.press('3');
  await expect.poll(() => modes(page)).toEqual({ [front.id]: 'ghost', [back.id]: 'solid' });
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-geometry-builds',
    geometryBuilds!,
  );
  await click(page, p(200, 80, 200));
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'false');
  // A crossing rectangle must not silently reselect the ghost.
  await page.keyboard.press('Escape');
  const a = p(650, 0, 650),
    b = p(-50, 0, -50);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('t');
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Vapaa mittaviiva/ }).click();
  await page.mouse.move(p(600, 0, 600).x, p(600, 0, 600).y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Verteksi');
  await click(page, p(600, 0, 600));
  await click(page, p(0, 0, 600));
  const result = await save(page);
  expect(result.bodies).toEqual(bodies);
  expect(resolveAnchor(result.bodies, result.guides[0].anchor)).toEqual([600, 0, 600]);
  expect(resolveAnchor(result.bodies, result.guides[0].endAnchor!)).toEqual([0, 0, 600]);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('ghost-reference.png') });
  // The model list remains the explicit way to recover and change a ghost.
  await page.getByRole('button', { name: 'Valitse', exact: true }).click();
  await revealBrowser(page);
  await page.getByRole('button', { name: /^Kappaleet / }).click();
  await page.getByTestId(`body-${front.id}`).click();
  await displayButton(page, 'Solid').click();
  await expect.poll(() => modes(page)).toEqual({ [front.id]: 'solid', [back.id]: 'solid' });
});

test('display shortcuts are idle-select only and view settings survive undo, redo and reload', async ({
  page,
}) => {
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('2');
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'flat' });
  // A held pointer (including marquee/orbit) must not change the display mode.
  const start = p(-30, -30);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.keyboard.press('4');
  await page.mouse.up();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'flat' });
  await displayButton(page, 'Wireframe').click();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'wireframe' });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'flat' });
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'wireframe' });
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'wireframe' });
  await page.keyboard.press('s');
  await page.keyboard.type('1234');
  await expect(page.getByTestId('width-input')).toHaveValue('1234');
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'wireframe' });
  await page.keyboard.press('Escape');
});

test('flat mode renders the original colour without lighting or textures and never edits material data', async ({
  page,
}, info) => {
  const body = {
    ...makeBody(400, 400, 80),
    color: '#a46c42',
    appearance: defaultAppearance('pine'),
  };
  await ready(page, [body]);
  const p = await view(page, [body]);
  await displayButton(page, 'Tasaväri').click();
  await expect.poll(() => modes(page)).toEqual({ [body.id]: 'flat' });
  await page.mouse.move(5, 5);
  const image = await page.screenshot({ path: info.outputPath('flat-colour.png') });
  const q = p(150, 130, 80);
  const rgb = await page.evaluate(
    async ({ image, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${image}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return [
        ...ctx.getImageData(
          Math.round(q.x * devicePixelRatio),
          Math.round(q.y * devicePixelRatio),
          1,
          1,
        ).data,
      ];
    },
    { image: image.toString('base64'), q },
  );
  [164, 108, 66].forEach((channel, index) =>
    expect(Math.abs(rgb[index] - channel)).toBeLessThanOrEqual(2),
  );
  expect((await save(page)).bodies).toEqual([body]);
  await displayButton(page, 'Solid').click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('toolbar modes work on a held multiselection and do not rebuild repeated geometry', async ({
  page,
}) => {
  const bodies = [makeBody(100, 100, 80), makeBody(100, 100, 80, [160, 0, 0])].map((b) => ({
    ...b,
    locked: true,
  }));
  await ready(page, bodies);
  const p = await view(page, bodies);
  await click(page, p(50, 50, 80));
  await page.keyboard.down('Shift');
  await click(page, p(210, 50, 80));
  await page.keyboard.up('Shift');
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  for (const [name, mode] of [
    ['Wireframe', 'wireframe'],
    ['Tasaväri', 'flat'],
    ['Ghost', 'ghost'],
    ['Solid', 'solid'],
  ]) {
    await displayButton(page, name).click();
    await expect
      .poll(() => modes(page))
      .toEqual(Object.fromEntries(bodies.map((b) => [b.id, mode])));
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  }
  expect((await save(page)).bodies).toEqual(bodies);
});

test('move snaps exactly to a ghost without selecting or moving that reference', async ({
  page,
}) => {
  const a = makeBody(100, 100, 100),
    b = makeBody(100, 100, 100, [353, 0, 0]);
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await click(page, p(400, 50, 100));
  await displayButton(page, 'Ghost').click();
  await click(page, p(50, 50, 100));
  await page.keyboard.press('m');
  const start = p(100, 100, 100),
    end = p(353, 100, 100);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.getByTestId('snap-hint')).toContainText(/Verteksi|Kulmapiste/);
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].origin).toEqual([253, 0, 0]);
  expect(result.bodies[1]).toEqual(b);
  expect(result.settings.modelDisplay?.overrides[b.id]).toBe('ghost');
});

test('Shift push/pull references a ghost corner at an exact non-grid height', async ({ page }) => {
  const source = makeBody(200, 200, 40),
    target = makeBody(220, 160, 72.625, [400, 0, 0]);
  await ready(page, [source, target]);
  const p = await view(page, [source, target]);
  await click(page, p(510, 80, 72.625));
  await displayButton(page, 'Ghost').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await click(page, p(100, 100, 40));
  await page.keyboard.down('Shift');
  const q = p(400, 0, 72.625);
  await page.mouse.move(q.x, q.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-depth-kind', 'vertex');
  await expect(page.getByTestId('height-input')).toHaveValue('+32.625');
  await click(page, q);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].feature.height).toBe(72.625);
  expect(result.bodies[1]).toEqual(target);
});
