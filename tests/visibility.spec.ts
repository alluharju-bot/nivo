import { expect, test } from '@playwright/test';
import { ready, revealBrowser, save } from './helpers';
import { freshProject, makeBody, noteMarkupSchema } from '../src/model/project';

test('H hides a selection batch, Shift H restores the latest hide from any control, and undo works', async ({
  page,
}) => {
  const bodies = [0, 1, 2].map((i) => ({
    ...makeBody(100, 100, 100, [i * 150, 0, 0]),
    name: `Osa ${i + 1}`,
  }));
  await ready(page, bodies);
  await revealBrowser(page);
  await page.getByTestId(`body-${bodies[0].id}`).click();
  await page.getByTestId(`body-${bodies[1].id}`).click({ modifiers: ['Shift'] });
  await page.keyboard.press('h');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Piilota: Osa 3', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Näkyvyys', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Näytä kaikki piilotetut · Alt+H', exact: true })
    .click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const stored = await save(page);
  expect(stored.bodies.map((b) => b.feature)).toEqual(bodies.map((b) => b.feature));
  await page.getByRole('button', { name: 'Navigoi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Navigoi', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('group hiding restores the folder without revealing previously hidden members; Alt H reveals all kinds', async ({
  page,
}) => {
  const bodies = [0, 1].map((i) => ({
    ...makeBody(100, 100, 100, [i * 150, 0, 0]),
    groupId: 'group',
    hidden: i === 1,
  }));
  const group = { id: 'group', name: 'Kaapit', hidden: false, locked: true };
  await ready(page, bodies, [], [group]);
  await revealBrowser(page);
  await page.getByTestId('group-group').click();
  await page.keyboard.press('h');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.keyboard.press('Alt+h');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  expect((await save(page)).groups[0].locked).toBe(true);
  const note = noteMarkupSchema.parse({
    id: 'note',
    kind: 'note',
    hidden: true,
    text: 'Note',
    anchor: { point: [0, 0, 0] },
    fallback: [0, 0, 0],
    offset: [30, 0, 0],
  });
  const p = freshProject();
  await page.getByTestId('project-file').setInputFiles({
    name: 'visibility.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...p,
        bodies,
        groups: [{ ...group, hidden: true }],
        annotations: [note],
        guides: [
          {
            id: 'line',
            mode: 'free',
            anchor: { point: [0, 0, 0] },
            plane: 'XY',
            angle: 0,
            length: 100,
            hidden: true,
          },
        ],
        dimensions: [
          { id: 'dim', bodyId: bodies[0].id, axis: 'x', from: 'min', to: 'max', hidden: true },
        ],
        settings: { ...p.settings, measurementsHidden: true, markupsHidden: true },
      }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Alt+h');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const all = await save(page);
  expect(
    [all.bodies, all.groups, all.guides, all.dimensions, all.annotations!]
      .flat()
      .every((v) => !v.hidden),
  ).toBe(true);
  expect(all.settings.measurementsHidden).toBe(false);
  expect(all.settings.markupsHidden).toBe(false);
});

test('typing H does not hide objects and context visibility stays in a submenu', async ({
  page,
}) => {
  const body = makeBody(100, 100, 100);
  await ready(page, [body]);
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  await page.getByRole('button', { name: 'Näkyvyys', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Piilota valinta · H', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await page.keyboard.press('Shift+H');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const viewport = page.getByTestId('viewport'),
    box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Valinnan toiminnot' });
  await menu.getByRole('menuitem', { name: 'Näkyvyys', exact: true }).click();
  await expect(menu.getByRole('menuitem', { name: /Näytä kaikki piilotetut/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu.getByRole('menuitem', { name: 'Näkyvyys', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Etsi toimintoa' });
  await input.fill('');
  await input.press('h');
  await expect(input).toHaveValue('h');
  await expect(viewport).toHaveAttribute('data-mesh-count', '1');
});

test('H and Shift H work on notes, guides and dimensions selected from the model list', async ({
  page,
}) => {
  const body = makeBody(200, 200, 20);
  const note = noteMarkupSchema.parse({
    id: 'note',
    kind: 'note',
    text: 'Kohta',
    anchor: { point: [0, 0, 20] },
    fallback: [0, 0, 20],
    offset: [30, 30, 0],
  });
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'annotations.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [body],
        annotations: [note],
        guides: [
          {
            id: 'line',
            mode: 'free',
            anchor: { point: [0, 0, 20] },
            plane: 'XY',
            angle: 0,
            length: 100,
          },
        ],
        dimensions: [{ id: 'dim', bodyId: body.id, axis: 'x', from: 'min', to: 'max' }],
      }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  for (const [tab, id] of [
    ['Merkinnät', 'markup-row-note'],
    ['Viivat', 'guide-row-line'],
    ['Mitat', 'dimension-row-dim'],
  ]) {
    await revealBrowser(page);
    await page.getByRole('button', { name: `${tab} 1`, exact: true }).click();
    const row = page.getByTestId(id);
    await row.getByRole('button').first().click();
    await page.keyboard.press('h');
    await expect(row).toHaveClass(/is-hidden/);
    await page.keyboard.press('Shift+H');
    await expect(row).not.toHaveClass(/is-hidden/);
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
    await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
  }
});
