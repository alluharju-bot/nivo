import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  bounds,
  freshProject,
  makeBody,
  type Body,
  type BodyGroup,
  type Guide,
  type Project,
  type Vec3,
} from '../src/model/project';

export async function ready(
  page: Page,
  bodies: Body[] = [],
  guides: Guide[] = [],
  groups: BodyGroup[] = [],
) {
  await page.goto(process.env.NIVO_BASE_PATH ?? '/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  if (bodies.length || guides.length || groups.length) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'direct.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, guides, groups })),
    });
    await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  }
}
export async function view(page: Page, bodies: Body[], side: 'top' | 'front' | 'right' = 'top') {
  if (
    (await page
      .getByRole('complementary', { name: 'Mallilista' })
      .getAttribute('data-expanded')) === 'true'
  )
    await page.getByRole('button', { name: 'Piilota mallilista' }).click();
  await page
    .getByRole('button', {
      name: { top: 'Ylhäältä', front: 'Edestä', right: 'Sivulta' }[side],
      exact: true,
    })
    .click();
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
      new THREE.Vector3(...({ top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0] }[side] as Vec3)),
      radius / Math.tan(Math.PI / 9),
    );
  camera.lookAt(center);
  camera.updateMatrixWorld();
  return (x: number, y: number, z = 0) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
}
export async function click(page: Page, p: { x: number; y: number }) {
  await page.mouse.click(p.x, p.y);
}
export async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

export async function editBody(page: Page, id: string) {
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  if ((await browser.count()) && (await browser.getAttribute('data-expanded')) === 'false')
    await page.getByRole('button', { name: 'Näytä mallilista' }).click();
  await page.getByTestId(`body-${id}`).click();
  await page.getByRole('button', { name: 'Muokkaa osaa', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', id);
  if (
    (await page
      .getByRole('complementary', { name: 'Mallilista' })
      .getAttribute('data-expanded')) === 'true'
  )
    await page.getByRole('button', { name: 'Piilota mallilista' }).click();
}

export async function revealBrowser(page: Page) {
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  if ((await browser.getAttribute('data-expanded')) === 'false')
    await page.getByRole('button', { name: 'Näytä mallilista' }).click();
}
