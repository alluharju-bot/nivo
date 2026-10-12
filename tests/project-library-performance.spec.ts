import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { parseProject } from '../src/model/project';
import { bodyVisible } from '../src/model/transforms';
import { ready } from './helpers';

const path = process.env.NIVO_AUDIT_MODEL;
test('private project library reads metadata without loading every stored model', async ({
  page,
}, info) => {
  test.skip(!path, 'Private project remains local.');
  test.setTimeout(180000);
  const project = parseProject(await readFile(path!, 'utf8'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  const openedAt = Date.now();
  await page.getByTestId('project-file').setInputFiles(path!);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(project.bodies.filter((b) => bodyVisible(b, project.groups)).length),
    { timeout: 90000 },
  );
  await expect(page.locator('.save-status')).toContainText('Tallessa', { timeout: 30000 });
  const initialOpenMs = Date.now() - openedAt;
  const result = await page.evaluate(async () => {
    const modulePath = '/src/storage/projects.ts';
    const storage = await import(modulePath);
    const session = await storage.loadLocalSession();
    for (let i = 0; i < 7; i++)
      await storage.saveLocal(
        { ...session.project, id: crypto.randomUUID(), name: `Vertailumalli ${i + 1}` },
        undefined,
        { activate: false },
      );
    const timings: number[] = [];
    let entries: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      entries = await storage.listLocalProjects();
      timings.push(performance.now() - start);
    }
    const baselineStart = performance.now();
    const stored = await new Promise<{ project: string }[]>((resolve, reject) => {
      const r = indexedDB.open('nivo', 2);
      r.onsuccess = () => {
        const tx = r.result.transaction('sessions'),
          request = tx.objectStore('sessions').getAll();
        tx.oncomplete = () => {
          r.result.close();
          resolve(request.result);
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    const bytes = stored.reduce((n, s) => n + s.project.length, 0);
    // Deliberately naive comparison: loading/parsing all models just to list names.
    const names = stored.map((s) => JSON.parse(s.project).name);
    const naiveReadMs = performance.now() - baselineStart;
    timings.sort((a, b) => a - b);
    return {
      entries: entries.length,
      projectCharacters: bytes,
      metadataCharacters: JSON.stringify(entries).length,
      metadataMedianMs: timings[5],
      metadataMaxMs: timings.at(-1),
      naiveReadMs,
      parsedModels: names.length,
    };
  });
  expect(result.entries).toBeGreaterThanOrEqual(8);
  expect(result.metadataCharacters).toBeLessThan(20000);
  expect(result.metadataCharacters).toBeLessThan(result.projectCharacters / 100);
  const libraryAt = Date.now();
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Projektikirjasto', exact: true }).locator('.library-card'),
  ).toHaveCount(result.entries);
  const libraryVisibleMs = Date.now() - libraryAt;
  await page.getByRole('button', { name: 'Sulje kirjasto', exact: true }).click();
  const canvas = page.getByTestId('viewport'),
    box = (await canvas.boundingBox())!;
  const buildsBefore = await canvas.getAttribute('data-geometry-builds');
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.mouse.down({ button: 'right' });
  const orbitAt = Date.now();
  for (let i = 0; i < 60; i++)
    await page.mouse.move(
      box.x + box.width * (0.55 + Math.sin(i / 12) * 0.15),
      box.y + box.height * (0.45 + Math.cos(i / 12) * 0.1),
    );
  await page.mouse.up({ button: 'right' });
  const orbitMs = Date.now() - orbitAt;
  expect(await canvas.getAttribute('data-geometry-builds')).toBe(buildsBefore);
  expect(errors).toEqual([]);
  const report = {
    bodies: project.bodies.length,
    initialOpenMs,
    libraryVisibleMs,
    orbitInput60StepsMs: orbitMs,
    geometryBuildsBefore: buildsBefore,
    ...result,
  };
  await writeFile(info.outputPath('project-library-metrics.json'), JSON.stringify(report, null, 2));
  console.log('LIBRARY_METRICS', JSON.stringify(report));
});
