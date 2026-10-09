import { expect, test, type Page } from '@playwright/test';
import * as THREE from 'three';
import { ready, view, save, revealBrowser } from './helpers';
import { makeBody, freshProject, noteMarkupSchema, type Vec3 } from '../src/model/project';
import { areaUnion } from '../src/model/markups';

async function areaTool(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Pinta-ala/ }).click();
}
async function world(page: Page, p: Vec3) {
  const canvas = page.getByTestId('viewport'),
    r = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const transform = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(...data.position),
      new THREE.Quaternion(...data.quaternion),
      new THREE.Vector3(1, 1, 1),
    )
    .invert();
  const v = new THREE.Vector3(...p)
    .applyMatrix4(transform)
    .applyMatrix4(new THREE.Matrix4().fromArray(data.projection));
  return { x: r.x + ((v.x + 1) * r.width) / 2, y: r.y + ((1 - v.y) * r.height) / 2 };
}

test('area starts on a floor below origin in perspective and changes plane with XYZ during drawing', async ({
  page,
}) => {
  const floor = makeBody(2400, 2400, 100, [0, 0, -123]);
  await ready(page, [floor]);
  await areaTool(page);
  await expect(page.getByRole('combobox', { name: 'Pinta-alan piirtotaso' })).toHaveValue('');
  const a = await world(page, [600, 600, -23]),
    b = await world(page, [1600, 1600, -23]);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('area-total')).toHaveText('1 m²');
  for (const axis of ['x', 'y', 'z']) {
    await page.keyboard.press(axis);
    await expect(page.getByRole('combobox', { name: 'Pinta-alan piirtotaso' })).toHaveValue(axis);
    const normal = JSON.parse(
      (await page.getByTestId('viewport').getAttribute('data-sketch-plane'))!,
    );
    expect(normal[['x', 'y', 'z'].indexOf(axis)]).toBe(1);
  }
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Alueen nimi', exact: true })).toBeVisible();
  const area = (await save(page)).annotations![0];
  if (area.kind !== 'area') throw Error('area');
  expect(areaUnion(area.rectangles).area).toBe(1_000_000);
  expect(area.frame.origin).toEqual([600, 600, -23]);
});

test('area plane can be chosen before starting; completed rectangles rotate together without changing total', async ({
  page,
}) => {
  const floor = makeBody(2400, 2400, 100, [0, 0, -100]);
  await ready(page, [floor]);
  await areaTool(page);
  await page.keyboard.press('z');
  const a = await world(page, [600, 600, 0]),
    b = await world(page, [1600, 1600, 0]);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('area-total')).toHaveText('1 m²');
  await page.keyboard.press('y');
  await expect(page.getByTestId('area-total')).toHaveText('1 m²');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Alueen nimi', exact: true })).toBeVisible();
  const area = (await save(page)).annotations![0];
  if (area.kind !== 'area') throw Error('area');
  expect(area.frame.normal).toEqual([0, 1, 0]);
  expect(area.frame.origin).toEqual([600, 600, 0]);
  expect(areaUnion(area.rectangles).area).toBe(1_000_000);
});

test('note placement and dragging focus text; leader and checkbox style remain independent', async ({
  page,
}, info) => {
  const body = makeBody(1000, 800, 20);
  await ready(page, [body]);
  await view(page, [body]);
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Huomautus/ }).click();
  const a = await world(page, [900, 700, 20]),
    b = await world(page, [700, 400, 20]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const text = page.getByRole('textbox', { name: 'Huomautuksen teksti', exact: true });
  await expect(text).toBeFocused();
  await page.keyboard.type('Laattalista');
  await text.press('Enter');
  await expect(page.getByTestId('viewport')).toBeFocused();
  await page.getByRole('checkbox', { name: 'Näytä kohdistusviiva' }).uncheck();
  await expect(page.locator('.model-markups .note-leader')).toHaveCount(0);
  await page.getByText('Tekstin ja kehyksen tyyli', { exact: true }).click();
  const bold = page.getByRole('checkbox', { name: 'Lihavoitu' });
  await bold.check();
  const box = (await bold.boundingBox())!,
    label = (await bold.locator('..').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(20);
  expect(Math.abs(box.y + box.height / 2 - label.y - label.height / 2)).toBeLessThan(2);
  const noteBox = (await page.locator('.model-markups .markup-label').boundingBox())!;
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(noteBox.x + noteBox.width / 2 - 40, noteBox.y + noteBox.height / 2 + 40, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(text).toBeFocused();
  await text.fill('Perutaan tämä teksti');
  await text.press('Escape');
  await expect(page.getByTestId('viewport')).toBeFocused();
  const saved = await save(page);
  expect(saved.annotations![0]).toMatchObject({
    kind: 'note',
    text: 'Laattalista',
    bold: true,
    leader: false,
  });
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper .note-leader')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('note-without-leader.png') });
});

test('color input previews 100 changes without commits, then saves once and one undo restores', async ({
  page,
}, info) => {
  const bodies = Array.from({ length: 100 }, (_, i) =>
    makeBody(50, 50, 50, [(i % 10) * 60, Math.floor(i / 10) * 60, 0]),
  );
  const note = noteMarkupSchema.parse({
    id: 'note',
    kind: 'note',
    text: 'Väritesti',
    anchor: { point: [250, 250, 100] },
    fallback: [250, 250, 100],
    offset: [0, 0, 50],
    color: '#fff2ce',
  });
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'colors.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, annotations: [note] })),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '100');
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Merkinnät 1', exact: true }).click();
  await page
    .getByTestId('markup-row-note')
    .getByRole('button', { name: /Väritesti/ })
    .click();
  const color = page.getByLabel('Laatikon väri', { exact: true }),
    label = page.locator('.model-markups .markup-label rect');
  const metrics = await color.evaluate(async (node: HTMLInputElement) => {
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      await new Promise(requestAnimationFrame);
      const t = performance.now();
      node.value = '#' + (0x112200 + i).toString(16);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      times.push(performance.now() - t);
    }
    return { median: times.sort((a, b) => a - b)[50], p95: times[95] };
  });
  await expect(label).toHaveAttribute('fill', '#112263');
  expect((await save(page)).annotations![0].color).toBe('#fff2ce');
  // Saving is not a property edit; the picker is committed only by its native change event.
  await color.dispatchEvent('change');
  await expect(page.getByRole('button', { name: 'Toimintohistoria' })).toContainText(
    'Merkintä päivitetty.',
  );
  expect((await save(page)).annotations![0].color).toBe('#112263');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(label).toHaveAttribute('fill', '#fff2ce');
  await revealBrowser(page);
  await page
    .getByTestId('markup-row-note')
    .getByRole('button', { name: /Väritesti/ })
    .click();
  await color.evaluate((node: HTMLInputElement) => {
    node.value = '#aabbcc';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(label).toHaveAttribute('fill', '#aabbcc');
  await page.keyboard.press('Escape');
  await expect(label).toHaveAttribute('fill', '#fff2ce');
  await info.attach('color-input-performance', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
});

test('new part naming is optional, accepts Tab, and creates a group in one undoable edit', async ({
  page,
}) => {
  const floor = makeBody(1500, 1500, 20);
  await ready(page, [floor]);
  await view(page, [floor]);
  await page.keyboard.press('s');
  const a = await world(page, [400, 400, 20]),
    b = await world(page, [700, 700, 20]);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  const prompt = page.getByRole('region', { name: 'Nimeä uusi osa' });
  await expect(prompt).toBeVisible();
  await expect(page.getByTestId('viewport')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Uuden osan nimi', exact: true })).toBeFocused();
  await page.keyboard.type('Laatta');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Uuden osan ryhmä', exact: true })).toBeFocused();
  await page.keyboard.type('Laatoitus');
  await page.keyboard.press('Enter');
  await expect(prompt).toHaveCount(0);
  const model = await save(page),
    part = model.bodies.find((b) => b.name === 'Laatta')!;
  expect(model.groups.find((g) => g.id === part.groupId)?.name).toBe('Laatoitus');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  const previous = await save(page);
  expect(previous.bodies).toHaveLength(2);
  expect(previous.groups).toHaveLength(0);
});

test('every measurement list has a trash button that removes only its own item and supports undo', async ({
  page,
}) => {
  const body = makeBody(1000, 1000, 100),
    note = noteMarkupSchema.parse({
      id: 'note',
      kind: 'note',
      text: 'Poistettava huomautus',
      anchor: { point: [0, 0, 100] },
      fallback: [0, 0, 100],
      offset: [100, 100, 0],
    });
  const guide = {
    id: 'line',
    mode: 'free' as const,
    plane: 'XY' as const,
    angle: 0,
    length: 400,
    anchor: { point: [0, 0, 100] as Vec3 },
  };
  const dim = {
    id: 'dim',
    bodyId: body.id,
    axis: 'x' as const,
    from: 'min' as const,
    to: 'max' as const,
  };
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'lists.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [body],
        guides: [guide],
        dimensions: [dim],
        annotations: [note],
      }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  for (const [tab, row, label, key] of [
    ['Merkinnät', 'markup-row-note', 'Poista merkintä', 'annotations'],
    ['Mitat', 'dimension-row-dim', 'Poista mitta', 'dimensions'],
    ['Viivat', 'guide-row-line', 'Poista viiva', 'guides'],
  ] as const) {
    await revealBrowser(page);
    await page.getByRole('button', { name: `${tab} 1`, exact: true }).click();
    const remove = page.getByTestId(row).getByRole('button', { name: label, exact: true });
    await expect(remove.locator('svg')).toHaveCount(1);
    await remove.click();
    const model = await save(page);
    expect(model[key]).toHaveLength(0);
    expect(model.bodies).toEqual([body]);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await expect(page.getByTestId(row)).toBeVisible();
  }
});
