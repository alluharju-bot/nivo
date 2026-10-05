import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

test('296 pine parts share three image sources while texture placements remain independent', async ({
  page,
}) => {
  test.skip(
    process.env.NIVO_PREVIEW === '1',
    'Inspects the material library through Vite source modules.',
  );
  await ready(page);
  const result = await page.evaluate(
    async (body) => {
      const path = '/src/render/materials.ts';
      const { createMaterialLibrary, disposeMaterial } = await import(path);
      const library = createMaterialLibrary(() => {});
      const materials = [];
      for (let i = 0; i < 296; i++)
        materials.push(
          library.create({
            ...body,
            appearance: {
              ...body.appearance,
              texture: { ...body.appearance!.texture, offsetX: i * 13 },
            },
          }),
        );
      const sources = new Set(
        materials.flatMap((m) =>
          [m.map, m.normalMap, m.roughnessMap].map((t) => `${t.source.uuid}:${t.colorSpace}`),
        ),
      );
      const values = {
        sources: sources.size,
        independent: materials[0].map !== materials[1].map,
        first: materials[0].map.offset.x,
        second: materials[1].map.offset.x,
      };
      materials.forEach(disposeMaterial);
      library.dispose();
      return values;
    },
    { ...makeBody(), appearance: defaultAppearance('pine') },
  );
  expect(result.independent).toBe(true);
  expect(result.first).not.toBe(result.second);
  expect(result.sources).toBe(3);
});
