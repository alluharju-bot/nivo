import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, LoopOnce, Vector3, type Object3D } from 'three';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready, save, view } from './helpers';
import { projected } from './precision-helpers';
import { freshProject, makeBody } from '../src/model/project';
import type { Motion } from '../src/model/motion';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Pivotit ja animaatiot' });
async function workspace(page: Page) {
  const button = page.getByRole('button', { name: 'Animaatio', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByLabel('Työtila', { exact: true }).selectOption('motion');
  await expect(panel(page)).toBeVisible();
}
const pose = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-motion-positions')) ?? '{}');
const runko = makeBody(120, 20, 120, [0, 130, 0], 'Runko');
const ovi = makeBody(100, 10, 100, [0, 0, 0], 'Ovi');

test('picks the anchor and multiple moving parts on canvas, and places the pivot on a measurement endpoint', async ({
  page,
}) => {
  const handle = makeBody(30, 10, 10, [40, 40, 0], 'Kahva');
  const bodies = [runko, ovi, handle];
  await ready(page, bodies, [
    {
      id: 'reference',
      mode: 'free',
      anchor: { point: [150, 20, 20] },
      endAnchor: { point: [150, 100, 20] },
      direction: [0, 1, 0],
      plane: 'XY',
      angle: 0,
      length: 80,
    },
  ]);
  await view(page, bodies);
  await workspace(page);
  await panel(page).getByRole('button', { name: 'Liuku', exact: true }).click();
  let at = await projected(page);
  for (const point of [
    [60, 140, 120],
    [50, 5, 100],
    [55, 45, 10],
  ]) {
    const p = at(point[0], point[1], point[2]);
    await page.mouse.click(p.x, p.y);
  }
  await expect(panel(page).locator('.motion-members > li')).toHaveCount(2);
  await panel(page).getByRole('button', { name: 'Poimi pivot / reuna', exact: true }).click();
  at = await projected(page);
  const target = at(150, 20, 20);
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-point', '[150,20,20]');
  await page.mouse.click(target.x, target.y);
  await panel(page).getByRole('button', { name: 'Tallenna pivot', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: 'Poista pivot', exact: true }),
  ).toBeVisible();
  const project = await save(page);
  expect(project.motions![0].movingIds).toEqual([ovi.id, handle.id]);
  expect(project.motions![0].anchorId).toBe(runko.id);
  expect(project.motions![0].pivot).toEqual([150, -110, 20]);
});

test('defines a hinge with a picked corner, previews reversibly, saves and undoes it', async ({
  page,
}, testInfo) => {
  await ready(page, [runko, ovi]);
  await view(page, [runko, ovi]);
  await workspace(page);
  await panel(page).getByRole('button', { name: 'Sarana', exact: true }).click();
  await panel(page).getByLabel('Pivotin nimi').fill('Kannen sarana');
  await panel(page).getByLabel('Lisää liikkuva osa').selectOption(ovi.id);
  await panel(page).getByRole('button', { name: 'Poimi pivot / reuna', exact: true }).click();
  const p = (await projected(page))(0, 0, 100);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-visible', 'true');
  await page.mouse.click(p.x, p.y);
  await expect(panel(page).getByLabel('Pivot X', { exact: true })).toHaveValue('0');
  await expect(panel(page).getByLabel('Pivot Y', { exact: true })).toHaveValue('0');
  await panel(page).getByLabel('Liikkeen kesto').fill('0.2');
  await panel(page).getByRole('button', { name: 'Tallenna pivot', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: 'Poista pivot', exact: true }),
  ).toBeVisible();
  const saved = await save(page),
    m = saved.motions![0];
  expect(m.name).toBe('Kannen sarana');
  expect(m.movingIds).toEqual([ovi.id]);
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await panel(page).getByRole('button', { name: 'Auki', exact: true }).click();
  await expect.poll(async () => (await pose(page))[m.id]).toBe(1);
  expect(await page.getByTestId('viewport').getAttribute('data-geometry-builds')).toBe(builds);
  await page.screenshot({ path: testInfo.outputPath('pivot-open.png') });
  const openedSave = await save(page);
  expect(openedSave.bodies).toEqual(saved.bodies);
  expect(openedSave.motions).toEqual(saved.motions);
  await panel(page).getByRole('button', { name: 'Suljettu', exact: true }).click();
  await expect.poll(async () => (await pose(page))[m.id]).toBe(0);
  await panel(page).getByRole('button', { name: 'Sulje animaatiot', exact: true }).click();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).motions ?? []).toHaveLength(0);
});

test('opens six drawers independently and reverses an in-flight move without editing geometry', async ({
  page,
}) => {
  const drawers = Array.from({ length: 6 }, (_, i) =>
    makeBody(100, 80, 10, [0, 30, i * 20], `Laatikko ${i + 1}`),
  );
  const motions: Motion[] = drawers.map((b, i) => ({
    id: `drawer-${i}`,
    name: b.name,
    kind: 'slide',
    anchorId: runko.id,
    movingIds: [b.id],
    pivot: [0, 0, 0],
    axis: [0, -1, 0],
    amount: 60,
    duration: i === 1 ? 2 : 0.6,
    easing: 'smooth',
  }));
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'laatikot.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...freshProject(), bodies: [runko, ...drawers], motions }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '7');
  await workspace(page);
  await panel(page).getByRole('button', { name: 'Laatikko 1: Avaa', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Laatikko 4: Avaa', exact: true }).click();
  await expect.poll(async () => (await pose(page))['drawer-3']).toBe(1);
  expect((await pose(page))['drawer-0']).toBe(1);
  expect((await pose(page))['drawer-1'] ?? 0).toBe(0);
  await panel(page).getByRole('button', { name: 'Laatikko 4', exact: true }).click();
  expect((await pose(page))['drawer-0']).toBe(1);
  await panel(page).getByRole('button', { name: 'Laatikko 2: Avaa', exact: true }).click();
  await expect.poll(async () => (await pose(page))['drawer-1'] ?? 0).toBeGreaterThan(0);
  await panel(page).getByLabel('Liikkeen asento', { exact: true }).press('ArrowLeft');
  expect((await pose(page))['drawer-1']).toBeLessThan(1);
  await panel(page).getByRole('button', { name: 'Laatikko 2: Sulje', exact: true }).click();
  await expect.poll(async () => (await pose(page))['drawer-1']).toBe(0);
  await panel(page).getByRole('button', { name: 'Auki', exact: true }).click();
  for (const i of [1, 2, 4, 5])
    await panel(page)
      .getByRole('button', { name: `Laatikko ${i + 1}: Avaa`, exact: true })
      .click();
  await expect
    .poll(async () => Object.values(await pose(page)).filter((n) => n === 1).length)
    .toBe(6);
  await panel(page)
    .getByRole('button', { name: 'Palauta kaikki suljetuiksi', exact: true })
    .click();
  await expect.poll(async () => Object.values(await pose(page)).every((n) => n === 0)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  expect((await save(page)).motions).toEqual(motions);
});

test('exports pivots, stable part IDs and playable open/close channels in GLB', async ({
  page,
}) => {
  const motion: Motion = {
    id: 'test-hinge',
    name: 'Oven sarana',
    kind: 'hinge',
    anchorId: runko.id,
    movingIds: [ovi.id],
    pivot: [0, -130, 0],
    axis: [0, 0, 1],
    amount: 90,
    duration: 1,
    easing: 'smooth',
  };
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'saranoitu.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...freshProject(), bodies: [runko, ovi], motions: [motion] }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox')
    .filter({ has: page.locator('option[value="glb"]') })
    .selectOption('glb');
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Vie tiedosto|Lataa|Vie malli/ })
    .click();
  const bytes = await readFile((await (await download).path())!);
  const json = JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
  expect(json.animations).toHaveLength(2);
  const loaded = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    '',
  );
  let door: Object3D | undefined;
  loaded.scene.traverse((o) => {
    if (o.userData.nivoId === ovi.id) door = o;
  });
  expect(door).toBeTruthy();
  loaded.scene.updateMatrixWorld(true);
  const rest = door!.localToWorld(new Vector3(100, 0, 100));
  expect(rest.x).toBeCloseTo(0.1);
  expect(rest.y).toBeCloseTo(0.1);
  expect(rest.z).toBeCloseTo(0);
  const mixer = new AnimationMixer(loaded.scene),
    action = mixer.clipAction(loaded.animations.find((a) => a.name.endsWith('__open'))!);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.update(1);
  loaded.scene.updateMatrixWorld(true);
  const opened = door!.localToWorld(new Vector3(100, 0, 100));
  expect(opened.x).toBeCloseTo(0);
  expect(opened.y).toBeCloseTo(0.1);
  expect(opened.z).toBeCloseTo(-0.1);

  const pivotIndex = json.nodes.findIndex((n: any) => n.extras?.nivoPivot?.id === motion.id);
  expect(pivotIndex).toBeGreaterThanOrEqual(0);
  expect(json.nodes[pivotIndex].extras.nivoPivot.movingIds).toEqual([ovi.id]);
  expect(
    json.nodes[pivotIndex].children.some((i: number) => json.nodes[i].extras.nivoId === ovi.id),
  ).toBe(true);
  expect(
    json.animations.every((a: any) =>
      a.channels.some((c: any) => c.target.node === pivotIndex && c.target.path === 'rotation'),
    ),
  ).toBe(true);
});
