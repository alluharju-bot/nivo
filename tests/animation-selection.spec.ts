import { expect, test, type Page } from '@playwright/test';
import { ready, save, view } from './helpers';
import { freshProject, makeBody, type Project } from '../src/model/project';
import { ensureAnimationNodes, type AnimationClip } from '../src/model/animation';

function fixture(count = 2): Project {
  const p = freshProject();
  p.bodies = Array.from({ length: count }, (_, i) =>
    makeBody(100, 10, 180, [i * 120, 0, 0], `Ovi ${i + 1}`),
  );
  const data = ensureAnimationNodes(p);
  const clip: AnimationClip = {
    id: 'doors',
    name: 'Ovet',
    duration: 4,
    loop: false,
    markers: [],
    tracks: data.nodes.map((node, i) => ({
      nodeId: node.id,
      keys: [0, 1 + i * 0.01, 2, 4].map((time, j) => ({
        id: `key-${i}-${j}`,
        time,
        pose: {
          ...node.rest,
          position: [node.rest.position[0] + j * 20, ...node.rest.position.slice(1)] as [
            number,
            number,
            number,
          ],
        },
        interpolation: 'smooth',
      })),
    })),
  };
  return { ...p, animation: { ...data, clips: [clip] } };
}
const panel = (p: Page) => p.getByTestId('animation-panel');
const diamond = (p: Page, i: number, j: number) => p.getByTestId(`animation-key-key-${i}-${j}`);
async function load(page: Page, p = fixture()) {
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'doors.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(p.bodies.length),
  );
  await view(page, p.bodies, 'front');
  const button = page.getByRole('button', { name: 'Animaatio', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByLabel('Työtila', { exact: true }).selectOption('motion');
  return p;
}
async function startDrag(page: Page, i: number, j: number, seconds: number) {
  const key = diamond(page, i, j);
  const box = (await key.boundingBox())!,
    lane = (await key.locator('..').boundingBox())!;
  const duration = Number(await page.getByLabel('Animaation kesto', { exact: true }).inputValue());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + (lane.width * seconds) / duration,
    box.y + box.height / 2,
    { steps: 5 },
  );
}
const times = (p: Project) => p.animation!.clips[0].tracks.map((t) => t.keys.map((k) => k.time));

test('moves keys on two tracks together with a shared preview and one undo step', async ({
  page,
}, info) => {
  const p = await load(page);
  await diamond(page, 0, 1).click();
  await diamond(page, 1, 1).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('animation-selection-count')).toHaveText('2 avainta');
  await startDrag(page, 0, 1, 0.5);
  expect(
    await diamond(page, 0, 1).evaluate((e) => parseFloat((e as HTMLElement).style.left)),
  ).toBeCloseTo(37.5);
  expect(
    await diamond(page, 1, 1).evaluate((e) => parseFloat((e as HTMLElement).style.left)),
  ).toBeCloseTo(37.75);
  await page.mouse.up();
  const updated = await save(page);
  expect(times(updated)).toEqual([
    [0, 1.5, 2, 4],
    [0, 1.51, 2, 4],
  ]);
  expect(updated.bodies).toEqual(p.bodies);
  await expect(diamond(page, 0, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(diamond(page, 1, 1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(times(await save(page))).toEqual(times(p));
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect(times(await save(page))).toEqual(times(updated));
  await page.screenshot({ path: info.outputPath('multi-keyframe-selection.png') });
  await diamond(page, 1, 1).click({ modifiers: ['Shift'] });
  await expect(diamond(page, 1, 1)).toHaveAttribute('aria-pressed', 'false');
  await expect(diamond(page, 0, 1)).toHaveAttribute('aria-pressed', 'true');
});

test('selects whole tracks and extends their timing, interpolation and deletion together', async ({
  page,
}) => {
  await load(page);
  const tracks = page.locator('.animation-track-name');
  await tracks.nth(0).click();
  await tracks.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('animation-selection-count')).toHaveText('8 avainta');
  await panel(page).getByLabel('Valittujen avainten siirtymä').fill('1');
  await panel(page).getByLabel('Valittujen avainten siirtymä').press('Enter');
  const moved = await save(page);
  expect(times(moved)).toEqual([
    [1, 2, 3, 5],
    [1, 2.01, 3, 5],
  ]);
  await expect(page.getByLabel('Animaation kesto', { exact: true })).toHaveValue('5');
  await panel(page).getByLabel('Valittujen avainten interpolointi').selectOption('linear');
  expect(
    (await save(page)).animation!.clips[0].tracks.every((t) =>
      t.keys.every((k) => k.interpolation === 'linear'),
    ),
  ).toBe(true);
  await panel(page).getByRole('button', { name: 'Poista valitut avaimet', exact: true }).click();
  expect((await save(page)).animation!.clips[0].tracks).toHaveLength(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(times(await save(page))).toEqual(times(moved));
});

test('keeps all keys on collision and cancels a group drag with Escape', async ({ page }) => {
  const p = await load(page);
  await diamond(page, 0, 1).click();
  await diamond(page, 1, 1).click({ modifiers: ['Shift'] });
  await startDrag(page, 0, 1, 1);
  await expect(page.locator('.animation-drag-feedback')).toContainText('jo avain');
  await page.mouse.up();
  await expect(panel(page).getByRole('alert')).toContainText('jo avain');
  expect(times(await save(page))).toEqual(times(p));
  await startDrag(page, 0, 1, 0.3);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('animation-timeline')).toBeVisible();
  expect(times(await save(page))).toEqual(times(p));
  await expect(page.locator('.animation-key[aria-pressed=true]')).toHaveCount(0);
});

test('selects ten tracks without a keyboard and can drag while multiselect is enabled', async ({
  page,
}, info) => {
  const p = await load(page, fixture(10));
  const toggle = page
    .getByTestId('animation-timeline')
    .getByRole('button', { name: 'Monivalinta', exact: true });
  if (info.project.name === 'tablet') await toggle.tap();
  else await toggle.click();
  for (let i = 0; i < 10; i++) {
    if (info.project.name === 'tablet') await diamond(page, i, 1).tap();
    else await diamond(page, i, 1).click();
  }
  await expect(page.locator('.animation-key[aria-pressed=true]')).toHaveCount(10);
  await diamond(page, 0, 1).scrollIntoViewIfNeeded();
  await startDrag(page, 0, 1, 0.25);
  await page.mouse.up();
  const updated = await save(page);
  for (let i = 0; i < 10; i++) {
    expect(times(updated)[i][1] - times(p)[i][1]).toBeCloseTo(0.25, 12);
    expect(times(updated)[i].filter((_, j) => j !== 1)).toEqual([0, 2, 4]);
  }
});

test('extends the clip when dragging its final keys, including a later numeric single-key edit', async ({
  page,
}) => {
  await load(page);
  await diamond(page, 0, 3).click();
  await diamond(page, 1, 3).click({ modifiers: ['Shift'] });
  await startDrag(page, 0, 3, 0.5);
  await expect(page.locator('.animation-drag-feedback')).toContainText('4.50 s');
  await page.mouse.up();
  await expect(page.getByLabel('Animaation kesto', { exact: true })).toHaveValue('4.5');
  expect(times(await save(page)).map((t) => t.at(-1))).toEqual([4.5, 4.5]);
  await diamond(page, 0, 1).click();
  await expect(page.getByTestId('animation-selection-count')).toHaveText('1 avain');
  await panel(page).getByLabel('Avaimen aika', { exact: true }).fill('6');
  await panel(page).getByLabel('Avaimen aika', { exact: true }).press('Enter');
  await expect(page.getByLabel('Animaation kesto', { exact: true })).toHaveValue('6');
  expect(times(await save(page))[0]).toEqual([0, 2, 4.5, 6]);
});
