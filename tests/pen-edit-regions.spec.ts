import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, type Vec3 } from '../src/model/project';
import { asComponent } from '../src/model/components';
import { booleanBodies } from '../src/cad/operations';
import { bezierPath } from '../src/cad/modeling';
import { penPath } from '../src/cad/paths';
import { createShape, solidVolume } from '../src/cad/kernel';
import { ready, view, click, save, editBody } from './helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

for (const existingChord of [false, true])
  test(`closing a saved curve in part edit mode fills its hole, survives history/reload and extrudes (old chord=${existingChord})`, async ({
    page,
  }, info) => {
    const basin = asComponent(
      booleanBodies([makeBody(200, 140, 80)], [makeBody(180, 120, 80, [10, 10, 10])], 'cut')[0],
    );
    const points: Vec3[] = [
      [50, 10, 80],
      [50, 70, 80],
      [150, 70, 80],
      [150, 10, 80],
    ];
    const curve = bezierPath(existingChord ? [...points].reverse() : points, 'Kaari');
    const chord = penPath([points[3], points[0]], 'Aiempi sulkuviiva');
    const bodies = [basin, curve, ...(existingChord ? [chord] : [])];
    await ready(page, bodies);
    const baseline = await save(page);
    let p = await view(page, bodies);
    await editBody(page, basin.id);
    await page.keyboard.press('k');
    await click(page, p(...points[3]));
    await click(page, p(...points[0]));
    await expect(page.locator('.status-bar [role="status"]')).toContainText(
      'lisätty osan pinnaksi',
    );
    const result = await save(page);
    expect(result.bodies).toHaveLength(bodies.length);
    expect(result.bodies[0].feature).not.toEqual(basin.feature);
    expect(result.bodies.slice(1)).toEqual(baseline.bodies.slice(1));
    expect(result.bodies[0].component).toEqual(baseline.bodies[0].component);
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', basin.id);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual(baseline.bodies);
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
    expect((await save(page)).bodies).toEqual(result.bodies);
    await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
    await page.reload();
    await expect(page.getByTestId('viewport')).toHaveAttribute(
      'data-mesh-count',
      String(bodies.length),
    );
    p = await view(page, result.bodies);
    await editBody(page, basin.id);
    const point = p(100, 25, 80);
    await page.mouse.move(point.x, point.y);
    await page.keyboard.press('e');
    await page.keyboard.type('-20');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const extruded = await save(page);
    expect(extruded.bodies).toHaveLength(bodies.length);
    const before = createShape(basin),
      after = createShape(extruded.bodies[0]);
    try {
      expect(solidVolume(after)).toBeGreaterThan(solidVolume(before));
      const solids = after.solids;
      try {
        expect(solids).toHaveLength(1);
      } finally {
        solids.forEach((s) => s.delete());
      }
    } finally {
      before.delete();
      after.delete();
    }
    await page.screenshot({ path: info.outputPath('edited-basin-ledge.png') });
  });
