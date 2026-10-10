import { editBody } from './helpers';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  bounds,
  freshProject,
  makeBody,
  makeProfileBody,
  type Body,
  type Project,
  type Vec3,
} from '../src/model/project';
import { sketchFrame, fromUV } from '../src/model/sketch';
async function ready(page: Page, bodies: Body[] = []) {
  await page.goto(process.env.NIVO_BASE_PATH ?? '/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  if (bodies.length) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'modeling.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies })),
    });
    await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  }
}
async function view(page: Page, bodies: Body[], side: 'top' | 'front' = 'top') {
  await page
    .getByRole('button', {
      name: side === 'top' ? 'Näkymä: Ylhäältä' : 'Näkymä: Edestä',
      exact: true,
    })
    .press('Enter');
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  const rect = (await page.getByTestId('viewport').boundingBox())!,
    box = bounds(bodies),
    a = new THREE.Vector3(...box.min),
    b = new THREE.Vector3(...box.max),
    center = a.clone().add(b).multiplyScalar(0.5),
    aspect = rect.width / rect.height;
  const radius = Math.max(a.distanceTo(b) * 0.65, 100) / Math.min(aspect, 1),
    camera = new THREE.OrthographicCamera(
      -radius * aspect,
      radius * aspect,
      radius,
      -radius,
      0.1,
      1e6,
    );
  camera.up.set(...((side === 'top' ? [0, 1, 0] : [0, 0, 1]) as Vec3));
  camera.position
    .copy(center)
    .addScaledVector(
      new THREE.Vector3(...((side === 'top' ? [0, 0, 1] : [0, -1, 0]) as Vec3)),
      radius / Math.tan(Math.PI / 9),
    );
  camera.lookAt(center);
  camera.updateMatrixWorld();
  return (x: number, y: number, z = 0) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test('circle on a face becomes a selected region, E makes a through hole, undo restores the region', async ({
  page,
}, info) => {
  const plate = makeBody(400, 300, 40);
  await ready(page, [plate]);
  const point = await view(page, [plate]);
  await editBody(page, plate.id);
  await page.keyboard.press('c');
  await drag(page, point(200, 150, 40), point(250, 150, 40));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  const split = await save(page);
  expect(split.bodies[0].id).toBe(plate.id);
  expect(split.bodies[0].feature.type).toBe('brep');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selection-kind', 'face');
  await expect(page.getByTestId('tool-context')).toContainText('Ympyrä');
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Leikkaa läpi', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const cut = await save(page);
  expect(cut.bodies[0].feature).not.toEqual(split.bodies[0].feature);
  expect(cut.bodies[0].feature.height).toBeCloseTo(40, 5);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('circle-through.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  expect((await save(page)).bodies[0]).toEqual(split.bodies[0]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText(
    'Muokkaus palautettu.',
  );
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  expect((await save(page)).bodies[0]).toEqual(cut.bodies[0]);
});

test('rectangle and pen draw directly on a vertical face and create recessed regions', async ({
  page,
}, info) => {
  const wall = makeBody(400, 40, 300);
  await ready(page, [wall]);
  const point = await view(page, [wall], 'front');
  await editBody(page, wall.id);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Muodon paksuus', exact: true }).fill('-10');
  await drag(page, point(40, 0, 40), point(140, 0, 140));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let model = await save(page);
  expect(model.bodies).toHaveLength(1);
  expect(model.bodies[0].feature.type).toBe('brep');
  expect(model.bodies[0].feature.depth).toBeCloseTo(40, 5);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  for (const p of [
    [220, 0, 40],
    [340, 0, 40],
    [320, 0, 170],
    [220, 0, 40],
  ]) {
    const q = point(...(p as Vec3));
    await page.mouse.click(q.x, q.y);
  }
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies).toHaveLength(1);
  await page.keyboard.press('e');
  await page.keyboard.type('-8');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('vertical-pockets.png') });
});

test('Cut accepts two targets and two cutters, consumes tools only when requested, and restores all on undo', async ({
  page,
}, info) => {
  const targets = [
    makeBody(400, 300, 20, [0, 0, 0], 'Alempi levy'),
    makeBody(400, 300, 20, [0, 0, 60], 'Ylempi levy'),
  ];
  const cutters = [100, 300].map((x, i) =>
    makeProfileBody(
      { kind: 'circle', radius: 25 },
      sketchFrame([x, 150, -10]),
      100,
      `Leikkuri ${i + 1}`,
      'construction',
    ),
  );
  await ready(page, [...targets, ...cutters]);
  await page.getByRole('button', { name: 'Muotoile', exact: true }).click();
  for (const target of targets)
    await page.getByRole('checkbox', { name: `Kohde: ${target.name}`, exact: true }).check();
  await page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }).click();
  for (const cutter of cutters)
    await page
      .getByRole('checkbox', { name: `Työstökappale: ${cutter.name}`, exact: true })
      .check();
  await page.getByRole('checkbox', { name: 'Säilytä työstökappaleet', exact: true }).uncheck();
  await page.screenshot({ path: info.outputPath('cut-groups.png') });
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muotoile', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  let model = await save(page);
  expect(model.bodies.map((b) => b.id).sort()).toEqual(targets.map((b) => b.id).sort());
  expect(model.bodies.every((b) => b.feature.type === 'brep')).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(4);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
});

test('viewport group picking, reverse Cut with kept tool, and Join use the same panel', async ({
  page,
}) => {
  const a = makeBody(100, 100, 20, [0, 0, 0], 'A'),
    b = makeBody(60, 100, 20, [50, 0, 0], 'B');
  await ready(page, [a, b]);
  const point = await view(page, [a, b]);
  await page.keyboard.press('b');
  const hit = point(20, 50, 20);
  await page.mouse.click(hit.x, hit.y);
  await expect(page.getByRole('checkbox', { name: 'Kohde: A', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }).click();
  const tool = point(105, 50, 20);
  await page.mouse.click(tool.x, tool.y);
  await expect(page.getByRole('checkbox', { name: 'Työstökappale: B', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Vaihda keskenään', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Kohde: B', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Työstökappale: A', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muotoile', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  let model = await save(page),
    result = model.bodies.find((body) => body.id === b.id)!;
  expect(result.origin[0]).toBeCloseTo(100, 5);
  expect(result.feature.width).toBeCloseTo(10, 5);
  expect(model.bodies.find((body) => body.id === a.id)).toEqual(a);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId(`body-${b.id}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Palauta', exact: true })).toBeEnabled();
  await page.keyboard.press('b');
  await page.getByRole('combobox', { name: 'Toiminto', exact: true }).selectOption('join');
  await page.getByRole('checkbox', { name: 'Yhdistä: A', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Yhdistä: B', exact: true }).check();
  await page.getByRole('button', { name: 'Hyväksy Join', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muotoile', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Yhdistettävät osat 0', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  model = await save(page);
  expect(model.bodies[0].feature.width).toBeCloseTo(110, 5);
});

test('ellipse, regular polygon and construction roles keep precise dimensions and survive reload', async ({
  page,
}, info) => {
  await ready(page);
  await page.keyboard.press('c');
  await page.getByRole('combobox', { name: 'Muoto', exact: true }).selectOption('ellipse');
  await page.getByText('Nimi ja käyttötapa', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Muodon nimi', exact: true }).fill('Ovaali osa');
  await page.getByRole('textbox', { name: 'Muodon nimi', exact: true }).blur();
  await page.keyboard.type('120');

  await page.getByTestId('ellipse-depth').fill('80');
  await page.getByRole('textbox', { name: 'Muodon paksuus', exact: true }).fill('12');
  await page
    .getByRole('combobox', { name: 'Muodon käyttö', exact: true })
    .selectOption('component');
  await page.getByRole('textbox', { name: 'Muodon paksuus', exact: true }).press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  let model = await save(page);
  expect(model.bodies[0]).toMatchObject({
    name: 'Ovaali osa',
    purpose: 'component',
    feature: {
      type: 'profile-extrusion',
      width: 120,
      depth: 80,
      height: 12,
      distance: 12,
      profile: { kind: 'ellipse', radiusX: 60, radiusY: 40 },
    },
  });
  await page.keyboard.press('c');
  await page.getByRole('combobox', { name: 'Muoto', exact: true }).selectOption('polygon');
  await page.getByRole('spinbutton', { name: 'Sivujen määrä', exact: true }).fill('6');
  await page.getByRole('spinbutton', { name: 'Sivujen määrä', exact: true }).blur();
  await page.keyboard.type('180');
  await page
    .getByRole('combobox', { name: 'Muodon käyttö', exact: true })
    .selectOption('construction');
  await page.getByTestId('diameter-input').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  model = await save(page);
  expect(model.bodies[1].purpose).toBe('construction');
  expect(model.bodies[1].feature).toMatchObject({
    type: 'profile-extrusion',
    distance: 0,
    profile: { kind: 'polygon' },
  });
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('profile-tools.png') });
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  expect((await save(page)).bodies).toEqual(model.bodies);
});

test('disjoint cuts report the problem atomically and flat sketches cannot be cutters', async ({
  page,
}) => {
  const a = makeBody(100, 100, 20, [0, 0, 0], 'Kohde'),
    b = makeBody(50, 50, 50, [200, 0, 0], 'Irrallinen'),
    flat = makeBody(20, 20, 0, [0, 200, 0], 'Luonnos');
  await ready(page, [a, b, flat]);
  await page.keyboard.press('b');
  await page.getByRole('checkbox', { name: 'Kohde: Kohde', exact: true }).check();
  await page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Työstökappale: Irrallinen', exact: true }).check();
  await expect(
    page.getByRole('checkbox', { name: 'Työstökappale: Luonnos', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Säilytä työstökappaleet', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('eivät leikkaa');
  expect((await save(page)).bodies).toEqual([a, b, flat]);
});

test('depth can be picked from another face while the original region stays selected', async ({
  page,
}) => {
  const plate = makeBody(400, 300, 40, [0, 0, 0], 'Levy'),
    reference = makeBody(100, 100, 10, [450, 100, 0], 'Syvyysviite');
  await ready(page, [plate, reference]);
  const point = await view(page, [plate, reference]);
  await editBody(page, plate.id);
  await page.keyboard.press('c');
  await drag(page, point(200, 150, 40), point(250, 150, 40));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Poimi tavoitemitta', exact: true }).click();
  const picked = point(475, 125, 10);
  await page.mouse.click(picked.x, picked.y);
  await expect(page.getByTestId('height-input')).toHaveValue('-30');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies.find((b) => b.id === reference.id)).toEqual(reference);
  expect(model.bodies.find((b) => b.id === plate.id)?.feature.type).toBe('brep');
});

test('circle uses an oblique face plane and stays on that plane through region extrusion', async ({
  page,
}, info) => {
  const frame = sketchFrame([0, 0, 100], [0, 0.6, 0.8]),
    body = makeProfileBody({ kind: 'rectangle', width: 400, depth: 300 }, frame, 20, 'Vino levy');
  await ready(page, [body]);
  const point = await view(page, [body]);
  await editBody(page, body.id);
  const top = { ...frame, origin: [0, 12, 116] as Vec3 },
    start = fromUV([200, 150], top),
    end = fromUV([250, 150], top);
  await page.keyboard.press('c');
  await drag(page, point(...start), point(...end));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await page.keyboard.press('e');
  await page.keyboard.type('-10');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies[0].feature).toMatchObject({ type: 'brep' });
  expect(model.bodies[0].feature.height).toBeCloseTo(body.feature.height, 4);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('oblique-pocket.png') });
});
