import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, parseProject, type Vec3 } from '../src/model/project';
import { createShape, meshBody } from '../src/cad/kernel';
import { edgeCrossings } from '../src/model/edgeCrossings';
import { splitWithPath, penPath } from '../src/cad/paths';
import { ready, view, editBody, save } from './helpers';
import { open, projected } from './precision-helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

function fixture() {
  return splitWithPath(
    makeBody(200, 120, 40),
    'z:max',
    penPath(
      [
        [0, 0, 40],
        [200, 120, 40],
      ],
      'Diagonal',
    ),
  ).body;
}

async function aim(page: Page, point: Vec3) {
  const project = await projected(page),
    p = project(...point);
  await page.mouse.move(p.x + 1, p.y - 1);
  await expect
    .poll(async () => {
      const actual = JSON.parse(
        (await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null',
      );
      return actual ? Math.hypot(...actual.map((n: number, i: number) => n - point[i])) : Infinity;
    })
    .toBeLessThan(1e-5);
  await expect(page.getByTestId('snap-hint')).toContainText('risteys');
  return p;
}

for (const editing of [false, true])
  for (const tool of ['k', 's', 'c', 't'])
    test(`${tool} acquires a line/triangle crossing ${editing ? 'inside' : 'outside'} part editing`, async ({
      page,
    }) => {
      const body = fixture(),
        line = penPath(
          [
            [0, 30, 40],
            [200, 30, 40],
          ],
          'Reference',
        );
      await ready(page, [body, line]);
      if (editing) await editBody(page, body.id);
      await view(page, [body, line]);
      await page.keyboard.press(tool);
      await aim(page, [50, 30, 40]);
    });

for (const reverse of [false, true])
  test(`one pen stroke crosses a diagonal and preserves all four editable regions (${reverse})`, async ({
    page,
  }) => {
    const body = fixture();
    await ready(page, [body]);
    if (reverse) await open(page, body, 'Reunat');
    else await editBody(page, body.id);
    await view(page, [body]);
    await page.keyboard.press('k');
    const project = await projected(page);
    const a = project(reverse ? 200 : 0, 30, 40),
      b = project(reverse ? 0 : 200, 30, 40);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.click(b.x, b.y);
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    const result = await save(page);
    expect(result.bodies).toHaveLength(1);
    const shape = createShape(result.bodies[0]);
    try {
      expect(
        meshBody(result.bodies[0], shape).faces.filter((f) => f.normal[2] > 0.99),
      ).toHaveLength(4);
    } finally {
      shape.delete();
    }
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([body]);
  });

test('saved customer model: pen acquires the wire crossing on its sloping side', async ({
  page,
}, info) => {
  test.skip(!process.env.NIVO_CROSSING_MODEL, 'Private model is only used for local verification');
  const project = parseProject(readFileSync(process.env.NIVO_CROSSING_MODEL!, 'utf8'));
  const body = project.bodies.find((b) => b.purpose === 'model')!;
  await ready(page, project.bodies);
  await editBody(page, body.id);
  await view(page, project.bodies, 'right');
  await page.keyboard.press('k');
  const shape = createShape(body),
    wire = createShape(project.bodies.at(-1)!);
  let point: Vec3;
  let endpoints: [Vec3, Vec3];
  let originalFaces: number;
  try {
    const solidMesh = meshBody(body, shape),
      lineMesh = meshBody(project.bodies.at(-1)!, wire);
    point = solidMesh.edgesCAD.flatMap((a) =>
      lineMesh.edgesCAD.flatMap((b) => edgeCrossings(a, b)),
    )[0];
    endpoints = [lineMesh.edgesCAD[0].start, lineMesh.edgesCAD[0].end];
    originalFaces = solidMesh.faces.length;
    expect(point).toBeDefined();
  } finally {
    shape.delete();
    wire.delete();
  }
  await aim(page, point);
  await page.screenshot({ path: info.outputPath('saved-model-intersection.png') });
  const screen = await projected(page),
    a = screen(...endpoints[0]),
    b = screen(...endpoints[1]);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.click(b.x, b.y);
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  const changed = (await save(page)).bodies.find((b) => b.id === body.id)!;
  const result = createShape(changed);
  try {
    expect(meshBody(changed, result).faces.length).toBeGreaterThan(originalFaces);
  } finally {
    result.delete();
  }
  await page.screenshot({ path: info.outputPath('saved-model-divided.png') });
});
