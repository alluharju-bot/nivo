import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { createShape, meshBody } from '../src/cad/kernel';
import { splitFace } from '../src/cad/operations';
import { ready, view, click, save, editBody, revealBrowser } from './helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);
function mesh(body: Body) {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
}
function dividedPlate() {
  const original = makeBody(400, 300, 40, [0, 0, 0], 'Jaettu levy');
  const rectangle = splitFace(
    original,
    'z:max',
    makeProfileBody({ kind: 'rectangle', width: 100, depth: 80 }, sketchFrame([40, 40, 40])),
  );
  const remaining = mesh(rectangle.body).faces.find(
    (f) => f.normal[2] > 0.99 && f.ref !== rectangle.face,
  )!;
  return splitFace(
    rectangle.body,
    remaining.ref,
    makeProfileBody({ kind: 'circle', radius: 30 }, sketchFrame([280, 150, 40])),
  ).body;
}

test('a contained sketch is a new part by default, including after a direct E or O operation', async ({
  page,
}) => {
  const plate = makeBody(400, 300, 40);
  await ready(page, [plate]);
  const point = await view(page, [plate]);
  const center = point(200, 150, 40);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.press('o');
  await page.keyboard.type('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await page.keyboard.type('-10');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const source = (await save(page)).bodies[0];
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  await page.keyboard.press('s');
  await expect(page.getByRole('combobox', { name: 'Piirtotapa', exact: true })).toHaveCount(0);
  await click(page, point(80, 80, 30));
  await click(page, point(160, 120, 30));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const result = await save(page);
  expect(result.bodies[0]).toEqual(source);
  expect(result.bodies[1].origin).toEqual([80, 80, 30]);
  expect(result.bodies[1].feature).toMatchObject({ width: 80, depth: 40, height: 0 });
});

test('double-click opens one part, drawing edits only it, and Escape cancels before leaving the context', async ({
  page,
}, info) => {
  const left = makeBody(300, 300, 40, [0, 0, 0], 'Kaappi'),
    right = makeBody(200, 300, 40, [350, 0, 0], 'Viite');
  await ready(page, [left, right]);
  const point = await view(page, [left, right]);
  const center = point(150, 150, 40);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId('edit-context')).toContainText('MuokkaustilaKaappi');
  await click(page, point(450, 150, 40));
  await expect(page.getByTestId('edit-context-hint')).toContainText('Kaappi on muokkaustilassa');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', left.id);
  await page.keyboard.press('s');
  await expect(page.getByRole('combobox', { name: 'Piirtotapa', exact: true })).toHaveValue(
    'region',
  );
  await click(page, point(40, 40, 40));
  await click(page, point(140, 120, 40));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(mesh(result.bodies[0]).boundaries).toHaveLength(1);
  expect(result.bodies[1]).toEqual(right);
  await page.screenshot({ path: info.outputPath('edit-context.png') });
  // The reference still supplies a plane, but it is never silently modified.
  await click(page, point(390, 80, 40));
  await click(page, point(490, 130, 40));
  await expect(page.getByRole('alert')).toContainText('muokattavan osan');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('edit-context')).toBeVisible();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('edit-context')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  await page.keyboard.press('s');
  await click(page, point(180, 180, 40));
  await click(page, point(250, 240, 40));
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  expect((await save(page)).bodies.slice(0, 2)).toEqual(result.bodies);
});

test('the edit button works for components; references snap but cannot be pushed, moved or erased', async ({
  page,
}) => {
  const source = {
    ...makeBody(200, 200, 40, [0, 0, 0], 'Komponentti'),
    purpose: 'component' as const,
  };
  const reference = { ...dividedPlate(), origin: [260, 0, 0] as [number, number, number] };
  await ready(page, [source, reference]);
  const point = await view(page, [source, reference]);
  await editBody(page, source.id);
  const q = point(400, 200, 40);
  await page.mouse.move(q.x, q.y);
  await page.keyboard.press('e');
  await click(page, q);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', '');
  await page.keyboard.press('m');
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.move(q.x + 30, q.y + 20);
  await page.mouse.up();
  await page.keyboard.press('u');
  const boundary = point(300, 80, 40);
  await page.mouse.move(boundary.x, boundary.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-boundary', '');
  expect((await save(page)).bodies).toEqual([source, reference]);
  await page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }).click();
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  await revealBrowser(page);
  await page.getByTestId(`body-${source.id}`).click();
  await page.getByRole('button', { name: 'Kiinnitä paikalleen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muokkaa osaa', exact: true })).toBeDisabled();
});

test('eraser repairs saved geometry without history, highlights both faces, and preserves other boundaries', async ({
  page,
}, info) => {
  const original = dividedPlate();
  await ready(page, [original]);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('nivo', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete('history');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeDisabled();
  const point = await view(page, [original]);
  await page.keyboard.press('u');
  const edge = point(40, 80, 40);
  await page.mouse.move(edge.x, edge.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-boundary', /surface/);
  await page.screenshot({ path: info.outputPath('erase-preview.png') });
  await click(page, edge);
  await expect(page.getByRole('contentinfo').getByRole('status')).toContainText('Rajaus poistettu');
  const repaired = (await save(page)).bodies[0];
  expect(mesh(repaired).boundaries).toHaveLength(1);
  expect(mesh(repaired).faces).toHaveLength(mesh(original).faces.length - 1);
  expect(mesh(repaired).volume).toBeCloseTo(mesh(original).volume, 4);
  await expect(page.getByRole('button', { name: 'Kumita', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A real outside corner is not a removable division.
  const outer = point(0, 150, 40);
  await page.mouse.move(outer.x, outer.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-boundary', '');
  await click(page, outer);
  expect((await save(page)).bodies[0]).toEqual(repaired);
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await view(page, [repaired]);
  await page.keyboard.press('u');
  await click(page, point(310, 150, 40));
  await expect(page.getByRole('contentinfo').getByRole('status')).toContainText('Rajaus poistettu');
  expect(mesh((await save(page)).bodies[0]).boundaries).toHaveLength(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(repaired);
});

test('an explicit new part inside the edit context snaps to another part without changing either source', async ({
  page,
}) => {
  const left = makeBody(300, 300, 40),
    right = makeBody(200, 300, 40, [350, 0, 0]);
  await ready(page, [left, right]);
  const point = await view(page, [left, right]);
  await editBody(page, left.id);
  await page.keyboard.press('s');
  await page.getByRole('combobox', { name: 'Piirtotapa', exact: true }).selectOption('new');
  await click(page, point(40, 40, 40));
  const end = point(550, 300, 40);
  await page.mouse.move(end.x - 3, end.y + 3);
  await expect(page.getByTestId('width-input')).toHaveValue('510');
  await expect(page.getByTestId('depth-input')).toHaveValue('260');
  await click(page, { x: end.x - 3, y: end.y + 3 });
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  const result = await save(page);
  expect(result.bodies.slice(0, 2)).toEqual([left, right]);
  expect(result.bodies[2].feature).toMatchObject({ width: 510, depth: 260 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', left.id);
  await page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }).click();
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
});

test('undo and redo survive reload while editing context resets; corrupt history keeps the model available', async ({
  page,
}) => {
  const original = dividedPlate();
  await ready(page, [original]);
  const point = await view(page, [original]);
  await editBody(page, original.id);
  await page.keyboard.press('u');
  await click(page, point(40, 80, 40));
  await expect(page.getByRole('contentinfo').getByRole('status')).toContainText('Rajaus poistettu');
  const changed = (await save(page)).bodies[0];
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(original);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(changed);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('nivo', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put('{ broken history', 'history');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies[0]).toEqual(changed);
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeDisabled();
});

test('a history storage failure still saves the current model and reports the shorter recovery scope', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'projects' && key === 'history')
        throw new DOMException('Simulated history quota', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  const part = makeBody(652, 400, 18);
  await ready(page, [part]);
  await expect(page.locator('.save-status')).toContainText('Malli tallessa; historia ei mahtunut');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies).toEqual([part]);
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeDisabled();
});

test('empty-space exit requires two clicks; misses, drags, navigation and drawing retain edit mode', async ({
  page,
}) => {
  const body = makeBody(300, 300, 40, [0, 0, 0], 'Kaappi');
  await ready(page, [body]);
  await view(page, [body]);
  await editBody(page, body.id);
  const canvas = page.getByTestId('viewport');
  const box = (await canvas.boundingBox())!;
  const empty = { x: box.x + 60, y: box.y + box.height - 130 };
  await click(page, empty);
  await expect(canvas).toHaveAttribute('data-editing-body', body.id);
  await page.mouse.down();
  await page.mouse.move(empty.x + 40, empty.y - 10);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-editing-body', body.id);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(empty.x + 35, empty.y - 25, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-editing-body', body.id);
  await page.keyboard.press('s');
  await page.mouse.dblclick(empty.x, empty.y);
  await expect(canvas).toHaveAttribute('data-editing-body', body.id);
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-editing-body', body.id);
  await page.keyboard.press('Escape'); // Finish the rectangle tool, keeping the edit scope.
  await page.mouse.dblclick(empty.x, empty.y);
  await expect(page.getByTestId('edit-context')).toHaveCount(0);
  expect((await save(page)).bodies).toEqual([body]);
});
