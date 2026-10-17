import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { createShape, meshBody, solidVolume } from '../src/cad/kernel';
import { ready, view, click, editBody, save } from './helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

function expectDivided(body: Body) {
  const shape = createShape(body);
  try {
    expect(meshBody(body, shape).faces.filter((f) => f.planar && f.normal[2] > 0.99)).toHaveLength(
      2,
    );
    expect(solidVolume(shape)).toBeCloseTo(400 * 300 * 40, 3);
  } finally {
    shape.delete();
  }
}

for (const mode of ['ghost', 'overlay'] as const) {
  for (const tool of ['rectangle', 'circle', 'pen'] as const) {
    test(`${tool} edits the active surface on the first attempt with ${mode}`, async ({ page }) => {
      const source = makeBody(400, 300, 40, [0, 0, 0], 'Muokattava osa');
      const bodies: Body[] = [source];
      if (mode === 'overlay')
        bodies.push(
          makeProfileBody(
            { kind: 'rectangle', width: 100, depth: 150 },
            sketchFrame([100, 0, 40]),
            0,
            'Erillinen pinnalla oleva muoto',
          ),
        );
      await ready(page, bodies);
      const p = await view(page, bodies);
      await editBody(page, source.id);
      if (mode === 'ghost')
        await page
          .getByRole('toolbar', { name: 'Näkymän pikatoiminnot' })
          .getByRole('button', { name: 'Ghost', exact: true })
          .click();
      await page.keyboard.press({ rectangle: 's', circle: 'c', pen: 'k' }[tool]);
      await click(page, p(tool === 'pen' ? 100 : 130, tool === 'pen' ? 0 : 60, 40));
      await click(
        page,
        tool === 'circle'
          ? p(170, 60, 40)
          : p(tool === 'pen' ? 100 : 260, tool === 'pen' ? 300 : 220, 40),
      );
      await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
      const result = await save(page);
      expect(result.bodies).toHaveLength(bodies.length);
      expect(result.bodies[0].feature.type).toBe('brep');
      expect(result.bodies[0].feature).not.toEqual(source.feature);
      expectDivided(result.bodies[0]);
      expect(result.bodies.slice(1)).toEqual(bodies.slice(1));
      if (mode === 'ghost') {
        // A real divided face must be independently editable without removing Ghost.
        const inside =
          tool === 'pen' ? p(50, 150, 40) : tool === 'circle' ? p(130, 60, 40) : p(220, 170, 40);
        await page.mouse.move(inside.x, inside.y);
        await page.keyboard.press('e');
        await expect(page.getByTestId('dynamic-input')).toBeVisible();
        await page.keyboard.type('10');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
        const extruded = (await save(page)).bodies[0],
          shape = createShape(extruded);
        try {
          const area =
            tool === 'pen' ? 100 * 300 : tool === 'circle' ? Math.PI * 40 ** 2 : 130 * 160;
          // Screen-ray intersections and CAD tolerances introduce sub-micrometre
          // endpoint errors; 0.05 mm³ still detects any wrong-face extrusion.
          expect(solidVolume(shape)).toBeCloseTo(400 * 300 * 40 + area * 10, 1);
        } finally {
          shape.delete();
        }
        await page.getByRole('button', { name: 'Peru', exact: true }).click();
        expect((await save(page)).bodies).toEqual(result.bodies);
      }
      await page.getByRole('button', { name: 'Peru', exact: true }).click();
      expect((await save(page)).bodies).toEqual(bodies);
    });
  }
}

for (const tool of ['s', 'k'] as const)
  for (const shift of [false, true])
    test(`${tool}: an off-plane guide cannot lift a surface-edit drawing off its part (Shift=${shift})`, async ({
      page,
    }) => {
      const source = makeBody(400, 300, 40);
      const start: [number, number, number] = tool === 'k' ? [100, 0, 40] : [130, 60, 40];
      await ready(
        page,
        [source],
        [
          {
            id: 'above-surface',
            mode: 'free',
            anchor: { point: [start[0], start[1], 42] },
            endAnchor: { point: [start[0] + 100, start[1], 42] },
            plane: 'XY',
            angle: 0,
            length: 100,
          },
        ],
      );
      const p = await view(page, [source]);
      await editBody(page, source.id);
      await page.keyboard.press(tool);
      if (shift) await page.keyboard.down('Shift');
      await click(page, p(...start));
      if (shift) await page.keyboard.up('Shift');
      if (tool === 'k')
        await expect
          .poll(
            async () =>
              JSON.parse(
                (await page.getByTestId('viewport').getAttribute('data-pen-points'))!,
              )[0][2],
          )
          .toBe(40);
      await click(page, p(tool === 'k' ? 100 : 260, tool === 'k' ? 300 : 220, 40));
      await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
      const result = await save(page);
      expect(result.bodies).toHaveLength(1);
      expect(result.bodies[0].feature.type).toBe('brep');
      expectDivided(result.bodies[0]);
      expect(result.guides[0].anchor).toEqual({ point: [start[0], start[1], 42] });
    });
