import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { makeBody, parseProject, type Body } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save } from './helpers';

test.describe.configure({ timeout: 180000 });
async function exportModel(page: Page, lods = false, instances = false) {
  const button = page.getByRole('button', { name: 'Vie 3D-malli', exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await dialog.getByLabel('Viennin kohde').selectOption('visible');
  await dialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  await dialog.getByRole('checkbox', { name: 'Etäisyysversiot · LOD-paketti' }).setChecked(lods);
  await dialog
    .getByRole('checkbox', { name: 'GPU-instanssit toistuville osille' })
    .setChecked(instances);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  return readFile((await (await download).path())!);
}
const gltf = (buffer: Uint8Array) => {
  const b = Buffer.from(buffer);
  expect(b.subarray(0, 4).toString()).toBe('glTF');
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
};
test('facade controls persist, maps retain separate physical scales and GLB shares copies', async ({
  page,
}, info) => {
  const bodies = [0, 2000, 4000].map((x, i): Body => ({
    ...makeBody(1600, 150, 2800, [x, 0, 0], `Seinä ${i}`),
    appearance: defaultAppearance('facade-concrete'),
    color: '#b9b6ad',
  }));
  await ready(page, bodies);
  const before = await save(page);
  const data = gltf(await exportModel(page));
  expect(data.meshes).toHaveLength(1);
  expect(data.materials).toHaveLength(1);
  expect(data.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined)).toHaveLength(3);
  const mat = data.materials[0],
    colorScale =
      mat.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform.scale[0],
    normalScale = mat.normalTexture.extensions.KHR_texture_transform.scale[0];
  expect(normalScale / colorScale).toBeCloseTo(60, 4);
  const zip = unzipSync(await exportModel(page, true, true));
  expect(Object.keys(zip)).toEqual(
    expect.arrayContaining(['LOD0.glb', 'LOD1.glb', 'LOD2.glb', 'manifest.json']),
  );
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  expect(manifest.levels.map((l: { triangles: number }) => l.triangles)).toEqual([36, 36, 36]);
  for (const level of [0, 1, 2]) {
    const json = gltf(zip[`LOD${level}.glb`]);
    expect(json.extensionsRequired).toContain('EXT_mesh_gpu_instancing');
    expect(json.meshes).toHaveLength(1);
  }
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByTestId(`body-${bodies[0].id}`).click();
  await page.locator('.model-materials > summary').click();
  await page.getByText('Pinnan rakenne · PBR', { exact: true }).click();
  await page.getByLabel('Sävyvaihtelu', { exact: true }).fill('0.6');
  await page.getByLabel('Sävyvaihtelu', { exact: true }).press('Enter');
  await page.getByLabel('Kuvion siemen', { exact: true }).fill('123');
  await page.getByLabel('Kuvion siemen', { exact: true }).press('Enter');
  const changed = await save(page);
  expect(changed.bodies[0].appearance!.procedural).toMatchObject({ variation: 0.6, seed: 123 });
  await page.screenshot({ path: info.outputPath('facade-materials.png') });
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  expect((await save(page)).bodies).toEqual(changed.bodies);
  // Reopening GPU-instanced output must restore every copy, not just the first.
  await page.getByTestId('project-file').setInputFiles({
    name: 'instanced.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(zip['LOD0.glb']),
  });
  const importing = page.getByRole('dialog', { name: 'Avaa 3D-tiedosto', exact: true });
  await importing.getByRole('button', { name: 'Avaa', exact: true }).click();
  await expect(importing).toBeHidden();
  const imported = await save(page);
  expect(imported.bodies).toHaveLength(3);
  expect(imported.bodies.map((b) => Math.round(b.origin[0])).sort((a, b) => a - b)).toEqual([
    0, 2000, 4000,
  ]);
  expect(imported.bodies.map((b) => b.name)).toEqual(bodies.map((b) => b.name));
  const appearance = imported.bodies[0].appearance!;
  expect(appearance.texture.width).toBeCloseTo(12000, 3);
  expect(appearance.mapPlacements!.normal!.width).toBeCloseTo(200, 3);
  // Another GLB export preserves independent scale after native project import.
  const roundTrip = gltf(await exportModel(page));
  const importedMaterial = roundTrip.materials[0];
  expect(
    importedMaterial.normalTexture.extensions.KHR_texture_transform.scale[0] /
      importedMaterial.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform
        .scale[0],
  ).toBeCloseTo(60, 4);
});
test('private apartment: compare facade appearance and export actual LOD counts', async ({
  page,
}, info) => {
  test.skip(
    !process.env.NIVO_APARTMENT_MODEL,
    'Optional private model stays outside the repository.',
  );
  const project = parseProject(readFileSync(process.env.NIVO_APARTMENT_MODEL!, 'utf8'));
  await ready(page);
  const load = async () => {
    await page.getByTestId('project-file').setInputFiles({
      name: 'Kerrostalo.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.getByTestId('viewport')).toHaveAttribute(
      'data-mesh-count',
      String(project.bodies.length),
    );
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  };
  await load();
  await page.screenshot({ path: info.outputPath('apartment-before.png') });
  const old = await exportModel(page, false, true),
    oldJson = gltf(old);
  const facade = project.bodies.find((b) => b.name === 'Kerrostalo')!;
  facade.appearance = defaultAppearance('facade-concrete');
  // Same user-selected base colour; compare texture structure rather than recolouring the building.
  await load();
  await page.screenshot({ path: info.outputPath('apartment-after.png') });
  const bytes = await exportModel(page, true, true),
    files = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  console.log(
    'Apartment export',
    JSON.stringify({
      original: {
        bytes: old.length,
        meshes: oldJson.meshes.length,
        materials: oldJson.materials.length,
      },
      manifest,
    }),
  );
  await writeFile(info.outputPath('apartment-lod-metrics.json'), JSON.stringify(manifest, null, 2));
  for (const level of manifest.levels) expect(level.triangles).toBeLessThanOrEqual(3550);
  expect(manifest.levels[0].geometries).toBe(2);
  expect(manifest.levels[0].materials).toBe(2);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 100000,
  });
  await page.screenshot({ path: info.outputPath('apartment-path-traced.png') });
});
