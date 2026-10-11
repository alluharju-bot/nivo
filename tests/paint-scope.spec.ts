import { expect, test } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, view, click, save } from './helpers';

test('face paint, pipette and whole-part paint are separate undoable actions', async ({ page }) => {
  const a = makeBody(200, 200, 80),
    b = makeBody(200, 200, 80, [350, 0, 0]);
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pinta', exact: true }).click();
  await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption('walnut');
  await page.getByLabel('Pensselin väri', { exact: true }).fill('#804020');
  await click(page, p(100, 100, 80));
  let project = await save(page);
  expect(Object.values(project.bodies[0].faceMaterials ?? {})).toEqual([
    expect.objectContaining({
      color: '#804020',
      appearance: expect.objectContaining({ preset: 'walnut' }),
    }),
  ]);
  expect(project.bodies[0].color).toBe(a.color);
  await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption('oak');
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('i');
  await click(page, p(100, 100, 80));
  await expect(page.getByLabel('Pensselin materiaali', { exact: true })).toHaveValue('walnut');
  await expect(page.getByLabel('Pensselin väri', { exact: true })).toHaveValue('#804020');
  await expect(page.getByRole('button', { name: 'Pipetti' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect((await save(page)).bodies).toEqual(project.bodies);
  await click(page, p(450, 100, 80));
  expect(Object.values((await save(page)).bodies[1].faceMaterials ?? {})[0]).toMatchObject({
    color: '#804020',
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[1].faceMaterials).toBeUndefined();
  await page.getByRole('button', { name: 'Koko osa', exact: true }).click();
  await click(page, p(100, 100, 80));
  project = await save(page);
  expect(project.bodies[0].faceMaterials).toBeUndefined();
  expect(project.bodies[0].appearance?.preset).toBe('walnut');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(Object.keys((await save(page)).bodies[0].faceMaterials ?? {})).toHaveLength(1);
});

test('pipette can sample a held part without modifying it; Escape cancels only the pipette', async ({
  page,
}) => {
  const a = {
    ...makeBody(200, 200, 80),
    locked: true,
    appearance: {
      ...defaultAppearance('brass'),
      roughness: 0.63,
      texture: { ...defaultAppearance('brass').texture, width: 173, rotation: 27 },
    },
    color: '#884422',
  };
  const b = { ...makeBody(200, 200, 80, [350, 0, 0]), appearance: defaultAppearance('brass') };
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pipetti' }).click();
  await click(page, p(100, 100, 80));
  await click(page, p(450, 100, 80));
  expect((await save(page)).bodies[1]).toMatchObject({
    color: a.color,
    appearance: { preset: 'brass', roughness: 0.63, texture: { width: 173, rotation: 27 } },
  });
  await page.getByRole('button', { name: 'Pipetti' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pipetti' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByLabel('Pensselin materiaali', { exact: true })).toBeVisible();
  expect((await save(page)).bodies[0]).toMatchObject(a);
});

test('render brush samples a painted face and reuses its complete finish', async ({ page }) => {
  const a = makeBody(200, 200, 80),
    b = makeBody(200, 200, 80, [350, 0, 0]);
  await ready(page, [a, b]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const p = async (x: number) => {
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const c = new Camera();
    c.position.fromArray(data.position);
    c.quaternion.fromArray(data.quaternion);
    c.projectionMatrix.fromArray(data.projection);
    c.updateMatrixWorld();
    const v = new Vector3(x, 100, 80).project(c),
      r = (await canvas.boundingBox())!;
    return { x: r.x + ((v.x + 1) * r.width) / 2, y: r.y + ((1 - v.y) * r.height) / 2 };
  };
  await page.getByRole('button', { name: 'Maalaa', exact: true }).click();
  await page.getByRole('button', { name: 'Pinta', exact: true }).click();
  await page.getByLabel('Materiaali', { exact: true }).selectOption('walnut');
  await click(page, await p(100));
  await page.getByLabel('Materiaali', { exact: true }).selectOption('oak');
  await page.getByRole('button', { name: 'Pipetti' }).click();
  await click(page, await p(100));
  await expect(page.getByLabel('Materiaali', { exact: true })).toHaveValue('walnut');
  await click(page, await p(450));
  await canvas.screenshot({ path: test.info().outputPath('face-paint-render.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const bodies = (await save(page)).bodies;
  expect(Object.values(bodies[0].faceMaterials ?? {})[0]?.appearance.preset).toBe('walnut');
  expect(Object.values(bodies[1].faceMaterials ?? {})[0]?.appearance.preset).toBe('walnut');
});
