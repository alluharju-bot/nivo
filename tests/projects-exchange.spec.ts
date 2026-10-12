import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody, type Project } from '../src/model/project';
import { History } from '../src/model/history';
import { ready, save } from './helpers';

test.describe.configure({ timeout: 120000 });
const input = (project: Project) => ({
  name: `${project.name}.nivo`,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(project)),
});
async function chooseFile(
  page: import('@playwright/test').Page,
  button: string,
  file: ReturnType<typeof input>,
) {
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await pending).setFiles(file);
}
async function showHeader(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: 'Vie 3D-malli', exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
}

test('migrates legacy autosave and switches separate project histories through the library', async ({
  page,
}) => {
  const original = { ...freshProject(), name: 'Alku', bodies: [makeBody(100, 60, 20)] };
  const history = new History(original);
  history.commit({ ...original, name: 'Kaluste A' });
  await ready(page);
  await page.evaluate(
    async ({ project, history }) => {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase('nivo');
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('nivo', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('projects');
        r.onsuccess = () => {
          const tx = r.result.transaction('projects', 'readwrite'),
            store = tx.objectStore('projects');
          store.put(JSON.stringify(project), 'active');
          store.put(history, 'history');
          tx.oncomplete = () => {
            r.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { project: history.current, history: history.serialize() },
  );
  await page.reload();
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Kaluste A');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const second = { ...freshProject(), name: 'Kaluste B', bodies: [makeBody(200, 70, 30)] };
  await page.getByTestId('project-file').setInputFiles(input(second));
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Kaluste B');
  const name = page.getByLabel('Projektin nimi', { exact: true });
  await name.fill('Kaluste B muokattu');
  await name.press('Enter');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  await expect(library.locator('.library-card')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('project-library.png') });
  await library
    .locator('.library-card')
    .filter({ has: page.getByRole('button', { name: 'Nimeä: Kaluste A', exact: true }) })
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Kaluste A');
  await showHeader(page);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Alku');
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  await library
    .locator('.library-card')
    .filter({ has: page.getByRole('button', { name: 'Nimeä: Kaluste B muokattu', exact: true }) })
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(name).toHaveValue('Kaluste B muokattu');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(name).toHaveValue('Kaluste B');
  await page.reload();
  await expect(name).toHaveValue('Kaluste B');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
});

test('adds a model as an undoable group, stores a reusable selection and prevents the browser menu', async ({
  page,
}) => {
  const a = makeBody(100, 100, 30, [0, 0, 0], 'Alkuperäinen');
  await ready(page, [a]);
  await showHeader(page);
  const incoming = {
    ...freshProject(),
    name: 'Lisättävä kaappi',
    bodies: [makeBody(80, 50, 60, [200, 0, 0])],
  };
  await chooseFile(page, 'Lisää malli nykyiseen projektiin', input(incoming));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await expect(
    page.getByRole('button', { name: 'Nimeä: Lisättävä kaappi', exact: true }),
  ).toBeVisible();
  const menuButton = page.getByRole('button', { name: 'Valinnan toiminnot', exact: true });
  await menuButton.click();
  const menu = page.getByRole('menu', { name: 'Valinnan toiminnot' });
  await expect(
    menu.getByRole('menuitem', { name: 'Piilota valinta · H', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('context-menu.png') });
  const prevented = await menu.evaluate(
    (element) =>
      !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  );
  expect(prevented).toBe(true);
  await menu.getByRole('menuitem', { name: 'Tallenna ja vie', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Tallenna valinta kirjastoon', exact: true }).click();
  const part = page.getByRole('dialog', { name: 'Tallenna valinta kirjastoon', exact: true });
  await part.getByLabel('Kirjasto-osan nimi').fill('Oma kaappi');
  await part.getByRole('button', { name: 'Tallenna kirjastoon', exact: true }).click();
  await expect(part).toBeHidden();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  await library.getByRole('button', { name: 'Omat osat', exact: true }).click();
  await library
    .locator('.library-card')
    .filter({ hasText: 'Oma kaappi' })
    .getByRole('button', { name: 'Lisää malliin', exact: true })
    .click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const stored = await save(page);
  expect(stored.bodies[0].id).toBe(a.id);
  expect(stored.groups.some((g) => g.name === 'Oma kaappi')).toBe(true);
});

test('exports printable STL and STEP, reopens both and imports a material-bearing GLB', async ({
  page,
}) => {
  const body = makeBody(40, 20, 10, [10, 20, -5], 'Tulostettava');
  await ready(page, [body]);
  await showHeader(page);
  const downloadFormat = async (format: string) => {
    await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
    await dialog.getByLabel('3D-tiedostomuoto').selectOption(format);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
    const file = await download;
    return { name: file.suggestedFilename(), buffer: await readFile((await file.path())!) };
  };
  const stl = await downloadFormat('stl');
  expect(stl.buffer.readUInt32LE(80)).toBe(12);
  const step = await downloadFormat('step');
  expect(step.buffer.toString()).toContain('ISO-10303-21');
  const glb = await downloadFormat('glb');
  expect(glb.buffer.subarray(0, 4).toString()).toBe('glTF');
  for (const file of [stl, step, glb]) {
    await page
      .getByTestId('project-file')
      .setInputFiles({ ...file, mimeType: 'application/octet-stream' });
    const dialog = page.getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true });
    await dialog.getByRole('button', { name: 'Avaa', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
    const project = await save(page),
      result = project.bodies[0];
    expect(result.feature.width).toBeCloseTo(40, 3);
    expect(result.feature.depth).toBeCloseTo(20, 3);
    expect(result.feature.height).toBeCloseTo(10, 3);
    if (file === glb) expect(result.color).toBe(body.color);
  }
});

test('one linkage state button links a chosen source and makes the result unique', async ({
  page,
}) => {
  const a = makeBody(50, 30, 10, [0, 0, 0], 'Oma osa'),
    b = makeBody(100, 60, 20, [200, 0, 0], 'Lähtöosa');
  await ready(page, [a, b]);
  await showHeader(page);
  await page.getByTestId(`body-${a.id}`).click();
  const button = page.getByRole('button', { name: 'Komponentin linkitys', exact: true });
  await expect(button).toHaveText('Uniikki');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Linkitä osa', exact: true });
  await dialog.getByLabel('Linkityksen lähtöosa').selectOption(b.id);
  await dialog.getByRole('button', { name: 'Linkitä', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(button).toHaveText('Linkitetty');
  let result = await save(page);
  expect(result.bodies[0].component?.id).toBe(result.bodies[1].component?.id);
  expect(result.bodies[0].feature.width).toBe(100);
  await button.click();
  await expect(button).toHaveText('Uniikki');
  result = await save(page);
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies[1].component).toBeDefined();
  await button.click();
  await expect(dialog.getByLabel('Linkityksen lähtöosa')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Peruuta', exact: true }).click();
  expect((await save(page)).bodies[0].component).toBeUndefined();
});

test('protects an open project against stale writes from another tab', async ({
  page,
  context,
}) => {
  await ready(page, [makeBody(50, 40, 30)]);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByLabel('Projektin nimi', { exact: true })).toBeEnabled();
  await page.getByLabel('Projektin nimi', { exact: true }).fill('Ensimmäinen välilehti');
  await page.getByLabel('Projektin nimi', { exact: true }).press('Enter');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await other.getByLabel('Projektin nimi', { exact: true }).fill('Vanha välilehti');
  await other.getByLabel('Projektin nimi', { exact: true }).press('Enter');
  await expect(other.locator('.save-status')).toContainText('epäonnistui');
  await expect(
    other.getByText('Projektia on muutettu toisessa välilehdessä.', { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue(
    'Ensimmäinen välilehti',
  );
});

test('browser-owned fullscreen Escape preserves the current tool', async ({ page }) => {
  await page.addInitScript(() => {
    let active: Element | null = null;
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
    Element.prototype.requestFullscreen = async () => {
      active = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
  await ready(page, [makeBody(30, 40, 20)]);
  await showHeader(page);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  await page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kynä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole('button', { name: 'Kynä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('GLB keeps per-face colours and embedded PBR images in one imported part', async ({
  page,
}) => {
  await ready(page);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#c3a57e';
    ctx.fillRect(0, 0, 4, 4);
    ctx.fillStyle = '#553323';
    ctx.fillRect(0, 0, 2, 4);
    return canvas.toDataURL('image/png');
  });
  const { defaultAppearance } = await import('../src/model/materials');
  const appearance = {
    ...defaultAppearance('paint'),
    assetId: 'wood',
    maps: { roughness: 'wood' },
    texture: { width: 40, height: 20, offsetX: 3, offsetY: 2, rotation: 10, lockAspect: false },
  };
  const body = {
    ...makeBody(40, 20, 10),
    appearance,
    faceMaterials: { '0': { color: '#ff0000', appearance: defaultAppearance('paint') } },
  };
  const project = {
    ...freshProject(),
    name: 'Teksturoitu',
    bodies: [body],
    assets: { wood: { name: 'Kuvio', dataUrl: image, width: 4, height: 4 } },
  };
  await page.getByTestId('project-file').setInputFiles(input(project));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await showHeader(page);
  await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await dialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const file = await pending,
    buffer = await readFile((await file.path())!);
  const document = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(document.images.length).toBeGreaterThan(0);
  expect(document.materials.length).toBeGreaterThan(1);
  await page
    .getByTestId('project-file')
    .setInputFiles({ name: 'Palautettu.glb', mimeType: 'model/gltf-binary', buffer });
  await page
    .getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true })
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true })).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const restored = await save(page);
  expect(restored.bodies[0].feature.type).toBe('mesh');
  expect(
    Object.values(restored.bodies[0].faceMaterials ?? {}).some((m) => m.color === '#ff0000'),
  ).toBe(true);
  expect(Object.keys(restored.assets ?? {}).length).toBeGreaterThan(0);
  expect(
    Object.values(restored.bodies[0].faceMaterials ?? {}).some((m) => m.appearance.maps?.roughness),
  ).toBe(true);

  // Reuse the same mesh definition in a second, mirrored glTF node.
  // Material primitives belong together; distinct instances must stay separate.
  const originalNode = document.nodes.findIndex((n: { mesh?: number }) => n.mesh !== undefined);
  const mirroredNode = document.nodes.length;
  document.nodes.push({ ...document.nodes[originalNode], name: 'Peilattu', scale: [-1, 1, 1] });
  const parent = document.nodes.find((n: { children?: number[] }) =>
    n.children?.includes(originalNode),
  );
  (parent?.children ?? document.scenes[0].nodes).push(mirroredNode);
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const binary = buffer.subarray(20 + buffer.readUInt32LE(12));
  const header = Buffer.from(buffer.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12);
  await page
    .getByTestId('project-file')
    .setInputFiles({
      name: 'Peilaus.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.concat([header, padded, binary]),
    });
  await page
    .getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true })
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true })).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const mirrored = (await save(page)).bodies.find((b) => b.name === 'Peilattu')!;
  expect(mirrored.feature.width).toBeCloseTo(40, 3);
  expect(mirrored.origin[0]).toBeCloseTo(-40, 3);
  const { meshBody } = await import('../src/exchange/mesh');
  const mesh = meshBody(mirrored);
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const points = mesh.triangles.slice(i, i + 3).map((v) => mesh.vertices.slice(v * 3, v * 3 + 3));
    const a = points[1].map((v, k) => v - points[0][k]),
      b = points[2].map((v, k) => v - points[0][k]);
    const normal = mesh.normals.slice(mesh.triangles[i] * 3, mesh.triangles[i] * 3 + 3);
    expect(
      (a[1] * b[2] - a[2] * b[1]) * normal[0] +
        (a[2] * b[0] - a[0] * b[2]) * normal[1] +
        (a[0] * b[1] - a[1] * b[0]) * normal[2],
    ).toBeGreaterThan(0);
  }
});

test('library renames the active project, duplicates it and safely removes only the copy', async ({
  page,
}) => {
  await ready(page, [makeBody(50, 40, 30)]);
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  const card = library.locator('.library-card[data-active="true"]');
  await expect(library.locator('.library-card')).toHaveCount(1);
  await card.locator('.inline-name').click();
  await card.locator('input').fill('Kirjastossa nimetty');
  await card.locator('input').press('Enter');
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue(
    'Kirjastossa nimetty',
  );
  await expect(
    card.getByRole('button', { name: 'Poista Kirjastossa nimetty', exact: true }),
  ).toBeDisabled();
  await card.getByRole('button', { name: 'Monista Kirjastossa nimetty', exact: true }).click();
  await expect(library.locator('.library-card')).toHaveCount(2);
  const copy = library.locator('.library-card').filter({
    has: page.getByRole('button', { name: 'Nimeä: Kirjastossa nimetty (kopio)', exact: true }),
  });
  await copy
    .getByRole('button', { name: 'Poista Kirjastossa nimetty (kopio)', exact: true })
    .click();
  await expect(library.locator('.library-card')).toHaveCount(2);
  await copy.getByRole('button', { name: 'Poista', exact: true }).click();
  await expect(library.locator('.library-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Sulje kirjasto', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Projektin nimi', { exact: true })).toHaveValue(
    'Kirjastossa nimetty',
  );
});

test('supported fullscreen Escape cancels the tool while the explicit exit releases keyboard lock', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let active: Element | null = null;
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: {
        lock: async (keys: string[]) =>
          (document.documentElement.dataset.keyboardLock = keys.join(',')),
        unlock: () => (document.documentElement.dataset.keyboardLock = ''),
      },
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
    Element.prototype.requestFullscreen = async () => {
      active = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
  await ready(page, [makeBody(30, 40, 20)]);
  await showHeader(page);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  await page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-lock', 'Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-lock', '');
});
