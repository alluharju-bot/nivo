import { test, expect } from '@playwright/test';
import { ready, view, save, revealBrowser } from './helpers';
import { makeBody, freshProject, makeProfileBody, type Guide } from '../src/model/project';
import { asComponent } from '../src/model/components';
import { translateSelection } from '../src/model/groups';
import { sketchFrame } from '../src/model/sketch';

test('one switch hides every saved measurement and snap target, restores them and survives reload', async ({
  page,
}) => {
  const body = makeBody(600, 400, 20);
  const guides: Guide[] = [
    {
      id: 'guide',
      anchor: { point: [120, 180, 20] },
      direction: [1, 0, 0],
      plane: 'XY',
      angle: 0,
      length: 250,
      mode: 'guide',
    },
    {
      id: 'free',
      anchor: { point: [150, 270, 20] },
      direction: [1, 0, 0],
      plane: 'XY',
      angle: 0,
      length: 250,
      mode: 'free',
    },
  ];
  await ready(page, [body], guides);
  const original = {
    ...freshProject(),
    bodies: [body],
    guides,
    dimensions: [{ id: 'dim', bodyId: body.id, axis: 'x', from: 'min', to: 'max' }],
  };
  await page.getByTestId('project-file').setInputFiles({
    name: 'measurements.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(page.getByTestId('dimension-3d')).toHaveCount(1);
  await expect(page.getByTestId('guide-label')).toHaveCount(2);
  const at = await view(page, [body]);
  await page.keyboard.press('k');
  await page.mouse.move(at(150, 270, 20).x, at(150, 270, 20).y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-key', /free/);
  await page.getByRole('button', { name: 'Piilota kaikki mittaviivat', exact: true }).click();
  await expect(page.getByTestId('guide-label')).toHaveCount(0);
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
  await page.mouse.move(at(150, 270, 20).x + 1, at(150, 270, 20).y);
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-snap-key', /free|guide/);
  let saved = await save(page);
  expect(saved.guides).toEqual(guides);
  expect(saved.dimensions).toEqual(original.dimensions);
  expect(saved.settings.measurementsHidden).toBe(true);
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('guide-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Näytä kaikki mittaviivat', exact: true }).click();
  await expect(page.getByTestId('guide-label')).toHaveCount(2);
  await expect(page.getByTestId('dimension-3d')).toHaveCount(1);
  saved = await save(page);
  expect(saved.bodies).toEqual([body]);
  expect(saved.guides).toEqual(guides);
});

test('a copied group becomes unique as a whole and preserves its internal repeated components', async ({
  page,
}) => {
  const a = asComponent({ ...makeBody(100, 100, 40), groupId: 'root' });
  const b = { ...a, id: 'second', origin: [150, 0, 0] as [number, number, number] };
  const original = {
    ...freshProject(),
    bodies: [a, b],
    groups: [{ id: 'root', name: 'Runko', kind: 'assembly' as const, hidden: false }],
  };
  const copied = translateSelection(original, [a.id, b.id], [0, 300, 0], true, 'root');
  await ready(page, copied.project.bodies, [], copied.project.groups);
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko kopio', exact: true }).click();
  await page.getByRole('button', { name: 'Tee ryhmä uniikiksi', exact: true }).click();
  const saved = await save(page);
  expect(saved.bodies.slice(0, 2)).toEqual(copied.project.bodies.slice(0, 2));
  expect(saved.bodies[2].component?.id).toBe(saved.bodies[3].component?.id);
  expect(saved.bodies[2].component?.id).not.toBe(saved.bodies[0].component?.id);
  expect(saved.groups).toEqual(copied.project.groups);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(copied.project.bodies);
});

for (const opening of [false, true])
  test(`${opening ? 'quick opening' : 'surface division'} keeps linked copies shared by default`, async ({
    page,
  }) => {
    const a = asComponent(makeBody(400, 300, 20, [0, 0, -20], 'Kohde'));
    const b = {
      ...a,
      id: 'copy',
      name: 'Kopio',
      origin: [600, 0, -20] as [number, number, number],
    };
    const profile = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([150, 150, 0]));
    await ready(page, [a, b, profile]);
    await revealBrowser(page);
    await page.getByTestId(`body-${profile.id}`).click();
    await page
      .getByRole('button', { name: opening ? 'Leikkaa aukko…' : 'Jaa pinta', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: opening ? 'Leikkaa aukko' : 'Jaa pinta',
      exact: true,
    });
    await expect(
      dialog.getByRole('checkbox', { name: 'Tee kohteista uniikkeja · muuta vain valittuja' }),
    ).not.toBeChecked();
    await dialog
      .getByRole('button', {
        name: opening ? 'Leikkaa läpi · 1 osaa' : 'Jaa valitut pinnat',
        exact: true,
      })
      .click();
    await expect(dialog).toHaveCount(0);
    const saved = await save(page);
    expect(saved.bodies).toHaveLength(2);
    expect(saved.bodies.every((p) => p.feature.type === 'brep')).toBe(true);
    expect(saved.bodies.map((p) => p.component!.id)).toEqual([a.component!.id, a.component!.id]);
    expect(saved.bodies.map((p) => p.origin)).toEqual([a.origin, b.origin]);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([a, b, profile]);
  });
