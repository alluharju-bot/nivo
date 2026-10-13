import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';
import type { CloudHead } from '../src/cloud/types';
import { projectRevision } from '../src/storage/projectRevision';
test.skip(
  ({ baseURL }) => !baseURL?.includes(':5183'),
  'Run with the isolated cloud fixture server.',
);
const alice = '11111111-1111-4111-8111-111111111111',
  bob = '22222222-2222-4222-8222-222222222222';
function session(owner: string) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.fixture`;
  return {
    access_token: token,
    refresh_token: 'fixture',
    token_type: 'bearer',
    expires_in: 7200,
    expires_at: Math.floor(Date.now() / 1000) + 7200,
    user: {
      id: owner,
      email: owner.slice(0, 4) + '@example.test',
      aud: 'authenticated',
      role: 'authenticated',
    },
  };
}
async function account(context: BrowserContext, owner: string) {
  await context.addInitScript(
    (value) => localStorage.setItem('nivo-cloud-auth', JSON.stringify(value)),
    session(owner),
  );
}
async function library(page: Page) {
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  return page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
}
function cloudBackend() {
  const heads = new Map<string, CloudHead>(),
    files = new Map<string, string>();
  async function backend(c: BrowserContext) {
    await c.route('https://nivo-cloud.test/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const token = req.headers().authorization?.split(' ')[1];
      let owner = '';
      try {
        owner = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString()).sub;
      } catch {}
      const respond = (value: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
          headers: { 'access-control-allow-origin': '*' },
        });
      if (req.method() === 'OPTIONS')
        return route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': '*',
          },
        });
      if (url.pathname.startsWith('/storage/v1/object/')) {
        const path = url.pathname.split('/nivo-projects/')[1];
        if (!path?.startsWith(owner + '/')) return respond({ message: 'Forbidden' }, 403);
        if (req.method() === 'POST') {
          const form = await new Response(new Uint8Array(req.postDataBuffer()!).buffer, {
            headers: { 'content-type': req.headers()['content-type'] },
          }).formData();
          files.set(path, await (form.get('') as File).text());
          return respond({ Key: 'nivo-projects/' + path });
        }
        const data = files.get(path);
        return data
          ? route.fulfill({ contentType: 'application/json', body: data })
          : respond({ message: 'Missing' }, 404);
      }
      if (url.pathname === '/rest/v1/nivo_projects') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return respond(
          [...heads.entries()]
            .filter(([key, h]) => key.startsWith(owner + '/') && (!id || h.id === id))
            .map(([, h]) => h),
        );
      }
      if (url.pathname === '/rest/v1/rpc/nivo_commit_project') {
        const p = req.postDataJSON();
        if (p.p_owner !== owner) return respond({ message: 'Forbidden' }, 403);
        const key = owner + '/' + p.p_id,
          old = heads.get(key);
        if ((old?.revision ?? 0) !== p.p_expected) return respond([]);
        const h = {
          id: p.p_id,
          name: p.p_name,
          revision: p.p_expected + 1,
          hash: p.p_hash,
          object_path: p.p_path,
          updated_at: new Date().toISOString(),
          parts: p.p_parts,
        };
        heads.set(key, h);
        return respond([h]);
      }
      if (url.pathname === '/auth/v1/logout') return respond({});
      return respond({ message: 'Unhandled ' + url.pathname }, 404);
    });
  }
  return { heads, files, backend };
}
test('two devices, offline edits, conflict preservation, restart and account isolation', async ({
  browser,
  page,
  context,
}) => {
  const { heads, backend } = cloudBackend();
  await account(context, alice);
  await backend(context);
  await ready(page, [makeBody(200, 18, 600)]);
  const name = page.getByLabel('Projektin nimi', { exact: true });
  await name.fill('Pilvitesti');
  await name.press('Enter');
  const a = await library(page);
  await a.getByRole('button', { name: 'Synkronoi tämä projekti', exact: true }).click();
  await expect(a.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  expect(heads.size).toBe(1);
  await expect(a.locator('.cloud-project-row')).toHaveCount(1);
  await expect(a.locator('.cloud-project-row')).toContainText('Pilvitesti');
  await a.getByRole('button', { name: 'Sulje kirjasto' }).click();
  const bContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await account(bContext, alice);
  await backend(bContext);
  const b = await bContext.newPage();
  await ready(b);
  const bLib = await library(b);
  await expect(bLib.locator('.cloud-project-row')).toHaveCount(1);
  await bLib
    .locator('.cloud-project-row')
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(b.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Pilvitesti');
  await expect(bLib).toHaveCount(0);
  await expect(b.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await bContext.setOffline(true);
  await b.getByLabel('Projektin nimi', { exact: true }).fill('MacBook offline');
  await b.getByLabel('Projektin nimi', { exact: true }).press('Enter');
  await expect(b.locator('.save-status')).toContainText('Tallessa');
  await name.fill('Desktop uudempi');
  await name.press('Enter');
  await library(page);
  await page.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(page.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  await expect(a.locator('.cloud-project-row')).toContainText('Desktop uudempi');
  await bContext.setOffline(false);
  await library(b);
  await b.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(
    b.getByText('Projektia on muutettu myös toisella laitteella.', { exact: true }),
  ).toBeVisible();
  await b.getByRole('button', { name: 'Säilytä tämäkin versio pilvessä', exact: true }).click();
  await expect.poll(() => heads.size).toBe(2);
  expect([...heads.values()].some((h) => h.name === 'Desktop uudempi')).toBe(true);
  await b.reload();
  await expect(b.getByLabel('Projektin nimi', { exact: true })).toHaveValue(
    'MacBook offline · rinnakkainen versio',
  );
  await library(b);
  await expect(b.getByRole('button', { name: 'Synkronoi nyt', exact: true })).toBeVisible();
  await b.screenshot({ path: test.info().outputPath('cloud-projects.png') });
  await bContext.close();
  const other = await browser.newContext();
  await account(other, bob);
  await backend(other);
  const c = await other.newPage();
  await ready(c);
  await library(c);
  await expect(c.locator('.cloud-project-row')).toHaveCount(0);
  await expect(
    c.getByRole('button', { name: 'Synkronoi tämä projekti', exact: true }),
  ).toBeVisible();
  await other.close();
});

test('email code signs in with Enter, rejects a wrong code and signs out without losing the model', async ({
  page,
  context,
}) => {
  const sent: unknown[] = [],
    checked: unknown[] = [];
  await context.route('https://nivo-cloud.test/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    if (req.method() === 'OPTIONS') return reply({});
    if (url.pathname === '/auth/v1/otp') {
      sent.push(req.postDataJSON());
      return reply({});
    }
    if (url.pathname === '/auth/v1/verify') {
      const body = req.postDataJSON();
      checked.push(body);
      return body.token === '123456'
        ? reply(session(alice))
        : reply({ code: 'otp_expired', msg: 'Code expired' }, 403);
    }
    if (url.pathname === '/rest/v1/nivo_projects') return reply([]);
    if (url.pathname === '/auth/v1/logout') return reply({});
    return reply({ message: 'Unexpected ' + url.pathname }, 404);
  });
  await ready(page, [makeBody(200, 18, 600)]);
  const dialog = await library(page);
  await dialog.getByLabel('Sähköposti', { exact: true }).fill('1111@example.test');
  await dialog.getByRole('button', { name: 'Lähetä kirjautumislinkki' }).click();
  await expect(dialog.getByText('Kirjautumisviesti lähetetty.', { exact: false })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ email: '1111@example.test', code_challenge_method: 's256' });
  await dialog.getByText('Kirjaudu sähköpostin koodilla', { exact: true }).click();
  const code = dialog.getByLabel('Vahvistuskoodi', { exact: true });
  await code.fill('000000');
  await code.press('Enter');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await code.fill('123456');
  await code.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Kirjaudu ulos' })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(checked).toHaveLength(2);
  await dialog.getByRole('button', { name: 'Kirjaudu ulos' }).click();
  await expect(dialog.getByLabel('Sähköposti', { exact: true })).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
});

test('automatic sync waits for an edit pause, manual sync bypasses it and another tab is protected', async ({
  page,
  context,
}) => {
  const { heads, files, backend } = cloudBackend();
  await account(context, alice);
  await backend(context);
  await ready(page, [makeBody(48, 98, 2700)]);
  await page.clock.install();
  const dialog = await library(page);
  await dialog.getByRole('button', { name: 'Synkronoi tämä projekti', exact: true }).click();
  await expect(
    dialog.getByText('Muutokset tallennetaan automaattisesti.', { exact: false }),
  ).toBeVisible();
  await page.clock.fastForward(7000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(files.size).toBe(0);
  await page.clock.fastForward(1100);
  await expect(dialog.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  expect(files.size).toBe(1);
  await dialog.getByRole('button', { name: 'Sulje kirjasto' }).click();
  const name = page.getByLabel('Projektin nimi', { exact: true });
  for (const text of ['Ensimmäinen', 'Toinen', 'Uusin muutos']) {
    await name.fill(text);
    await name.press('Enter');
    await expect(page.locator('.save-status')).toContainText('Tallessa');
    await page.clock.fastForward(4000);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect(files.size).toBe(1);
  }
  await library(page);
  await dialog.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(dialog.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  expect(files.size).toBe(2);
  expect([...heads.values()][0].name).toBe('Uusin muutos');
  const uploaded = [...files.values()].at(-1)!;
  expect([...heads.values()][0].hash).toBe(await projectRevision(JSON.parse(uploaded)));

  await page.clock.fastForward(31000);
  await expect(dialog.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  expect(files.size).toBe(2);

  // Same-origin second tab edits the local database while the first tab still
  // displays its old snapshot. The worker/cache must notice the saved change.
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Uusin muutos');
  await expect(other.getByRole('button', { name: 'Valitse', exact: true })).toBeEnabled();
  await other.getByLabel('Projektin nimi', { exact: true }).fill('Toisen välilehden muutos');
  await other.getByLabel('Projektin nimi', { exact: true }).press('Enter');
  await expect(other.locator('.save-status')).toContainText('Tallessa');
  await other.close();
  await dialog.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('toisessa välilehdessä');
  expect(files.size).toBe(2);
});
