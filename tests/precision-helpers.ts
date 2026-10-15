import { expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { editBody } from './helpers';
import type { Body } from '../src/model/project';
export const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Geometrian ominaisuudet', exact: true });
export const bar = (page: Page) =>
  page.getByRole('toolbar', { name: 'Geometrian muokkaus', exact: true });
export async function open(page: Page, body: Body, selection = 'Reunat') {
  await editBody(page, body.id);
  await page
    .getByLabel('Muokkauksen kohde', { exact: true })
    .getByRole('button', { name: selection, exact: true })
    .click();
  const conversion = panel(page).getByRole('button', {
    name: 'Muokkaa verkkokopiota',
    exact: true,
  });
  await expect(
    panel(page).getByText('Valinta ja tarkkuus', { exact: true }).or(conversion),
  ).toBeVisible();
  if (!(await conversion.isVisible()))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-editing', body.id);
}
export async function projected(page: Page) {
  const canvas = page.getByTestId('viewport'),
    rect = (await canvas.boundingBox())!;
  const info = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new THREE.Camera();
  camera.position.fromArray(info.position);
  camera.quaternion.fromArray(info.quaternion);
  camera.updateMatrixWorld();
  camera.projectionMatrix.fromArray(info.projection);
  return (x: number, y: number, z = 0) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
}
