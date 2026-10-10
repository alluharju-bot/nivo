import { test, expect, type Page } from '@playwright/test';
import { makeBody, bounds } from '../src/model/project';
import { ready, view, save } from './helpers';
import { asComponent } from '../src/model/components';

async function select(page: Page, ids: string[]) {
  await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
  for (const [i, id] of ids.entries())
    await page.getByTestId(`body-${id}`).click({ modifiers: i ? ['Control'] : [] });
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await expect(page.getByTestId('scale-factor')).toBeVisible();
}
test('numeric target dimension, undo, redo and persistent tool', async ({ page }) => {
  const part = makeBody(200, 100, 60, [10, 20, 30]);
  await ready(page, [part]);
  await view(page, [part]);
  await select(page, [part.id]);
  await page.getByRole('button', { name: 'Alakulma', exact: true }).click();
  await page.getByTestId('scale-x').fill('400');
  await expect(page.getByTestId('scale-factor')).toHaveValue('2');
  await expect(page.getByTestId('scale-y')).toHaveValue('200');
  await page.getByTestId('scale-x').press('Enter');
  await expect(page.getByTestId('scale-factor')).not.toBeVisible();
  const scaled = await save(page);
  expect(bounds(scaled.bodies)).toEqual({ min: [10, 20, 30], max: [410, 220, 150] });
  await expect(page.getByRole('button', { name: 'Skaalaa', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([part]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(scaled.bodies);
});
test('axis handle previews without CAD calls and commits on release', async ({ page }) => {
  const requests: string[] = [];
  await page.exposeFunction('cadRequestSeen', (type: string) => requests.push(type));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      void (window as unknown as { cadRequestSeen: (s: string) => Promise<void> }).cadRequestSeen(
        (message as { type: string }).type,
      );
      return Reflect.apply(original, this, [message, ...args]);
    };
  });
  const part = makeBody(200, 100, 60);
  await ready(page, [part]);
  const project = await view(page, [part]);
  await select(page, [part.id]);
  const geometry = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  const a = project(200, 50, 30),
    b = project(250, 50, 30);
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-scale-handle', 'x');
  requests.length = 0;
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.getByTestId('scale-factor')).toHaveValue('1.5');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', geometry!);
  expect(requests.filter((type) => ['scale', 'instances', 'sync'].includes(type))).toEqual([]);
  await page.mouse.up();
  await expect(page.getByTestId('scale-factor')).not.toBeVisible();
  const result = await save(page),
    extent = bounds(result.bodies);
  expect(extent.min[0]).toBeCloseTo(-50, 4);
  expect(extent.max[0]).toBeCloseTo(250, 4);
  expect(extent.max[1]).toBeCloseTo(100, 4);
  expect(extent.max[2]).toBeCloseTo(60, 4);
  expect(requests.filter((type) => type === 'scale')).toHaveLength(1);
});
test('axis shortcut, invalid value and Escape leave original geometry intact', async ({ page }) => {
  const part = makeBody(200, 100, 60);
  await ready(page, [part]);
  await view(page, [part]);
  await select(page, [part.id]);
  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'Skaalaa Y-suunnassa' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('scale-x')).not.toBeVisible();
  await page.getByTestId('scale-factor').fill('0');
  await page.getByTestId('scale-factor').press('Enter');
  await expect(
    page.getByText('Anna positiivinen skaalauskerroin, enintään 1000. Esimerkiksi 0,5 tai 2.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByTestId('scale-factor').fill('2');
  await page.getByTestId('scale-factor').press('Escape');
  expect((await save(page)).bodies).toEqual([part]);
});
test('nested group scales all members, protects a held linked copy and can explicitly become unique', async ({
  page,
}) => {
  const a = { ...asComponent(makeBody(20, 30, 40)), groupId: 'root' },
    b = { ...asComponent(makeBody(20, 30, 40, [100, 0, 0]), a.component!.id), groupId: 'child' },
    held = { ...asComponent(makeBody(20, 30, 40, [300, 0, 0]), a.component!.id), locked: true };
  const groups = [
    { id: 'root', name: 'Kaapit', hidden: false },
    { id: 'child', name: 'Sisäosat', parentId: 'root', hidden: false },
  ];
  await ready(page, [a, b, held], [], groups);
  await view(page, [a, b, held]);
  await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Valitse ryhmä: Kaapit', exact: true }).click();
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await page.getByRole('button', { name: 'Alakulma', exact: true }).click();
  await page.getByTestId('scale-factor').fill('2');
  await page.getByTestId('scale-factor').press('Enter');
  await expect(page.getByText(/Valinnassa on paikalleen kiinnitetty osa\./)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Vain valitut · tee uniikeiksi' }).check();
  await page.getByTestId('scale-factor').press('Enter');
  await expect(page.getByTestId('scale-factor')).not.toBeVisible();
  const result = await save(page);
  expect(result.bodies[2]).toEqual(held);
  expect(result.groups).toEqual(groups);
  expect(bounds(result.bodies.slice(0, 2))).toEqual({ min: [0, 0, 0], max: [240, 60, 80] });
  expect(result.bodies.slice(0, 2).every((b) => !b.component)).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b, held]);
});
