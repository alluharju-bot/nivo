import { test, expect } from '@playwright/test';
import { makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, save } from './helpers';

for (const mode of ['bezier', 'smooth'] as const)
  test(`finished ${mode} curve closes with straight pen edges into an editable face`, async ({
    page,
  }, info) => {
    const frame = makeProfileBody(
      { kind: 'rectangle', width: 500, depth: 300 },
      sketchFrame([-250, -150, 0]),
      0,
      'Piirustuskehys',
      'construction',
    );
    await ready(page, [frame]);
    let p = await view(page, [frame]);
    await page.getByRole('button', { name: 'Muodot', exact: true }).click();
    await page.getByRole('button', { name: 'Bézier-käyrä', exact: true }).click();
    await page.getByRole('combobox', { name: 'Bézierin piirtotapa' }).selectOption(mode);
    const points =
      mode === 'bezier'
        ? [
            [-150, -40],
            [-150, 100],
            [150, 100],
            [150, -40],
          ]
        : [
            [-150, -40],
            [0, 90],
            [150, -40],
          ];
    for (const [x, y] of points) await click(page, p(x, y));
    await page.getByRole('button', { name: 'Valmis viiva', exact: true }).click();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
    const before = await save(page);
    expect(before.bodies[1].curve?.closed).toBe(false);
    expect(before.bodies[1].curve?.mode).toBe(mode);
    // Joining must also work with a previously saved curve, without a live draft.
    await page.reload();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
    p = await view(page, [frame]);
    await page.keyboard.press('k');
    await click(page, p(150, -40));
    if (mode === 'smooth') {
      await click(page, p(150, -90));
      await click(page, p(-150, -90));
    }
    await click(page, p(-150, -40));
    await expect(page.locator('.status-bar [role="status"]')).toContainText('täytetty pinnoiksi');
    const result = await save(page);
    expect(result.bodies).toHaveLength(4);
    const face = result.bodies.find((b) => b.penRegion)!;
    expect(face.feature.type === 'brep' && face.feature.solid).toBe(false);
    expect(face.penRegion!.sources).toContain(before.bodies[1].id);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual(before.bodies);
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
    expect((await save(page)).bodies).toEqual(result.bodies);
    await page.keyboard.press('Escape');
    await page.mouse.move(p(0, 0).x, p(0, 0).y);
    await page.keyboard.press('e');
    await page.keyboard.type('25');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => {
        const body = (await save(page)).bodies.find((b) => b.id === face.id);
        return body?.feature.type === 'brep' && body.feature.solid;
      })
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`mixed-${mode}-extruded.png`) });
  });
