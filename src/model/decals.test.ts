import { expect, it } from 'vitest';
import { defaultAppearance } from './materials';
import { freshProject, makeBody, parseProject } from './project';
import { mergeProject, selectionProject } from './projectImport';
import { newSurfaceLayer, patchSurfaceLayer } from './surfaceLayers';
import { layerAssetIds } from './decals';

it('retains editable sources and manual masks through save, library extraction and project import', () => {
  const decal = {
    ...newSurfaceLayer('decal'),
    decal: { type: 'image' as const, assetId: 'logo' },
    center: [50, 25] as [number, number],
  };
  const paint = {
    ...newSurfaceLayer('paint'),
    maskMode: 'manual' as const,
    strokes: [
      {
        points: [
          [1, 2],
          [12, 7],
        ] as [number, number][],
        radius: 3,
        strength: 0.75,
        hardness: 0.8,
        erase: false,
      },
    ],
  };
  const body = {
    ...makeBody(),
    faceMaterials: {
      0: {
        color: '#ffffff',
        appearance: { ...defaultAppearance('iron-black'), layers: [decal, paint] },
      },
    },
  };
  const project = {
    ...freshProject(),
    bodies: [body],
    assets: { logo: { name: 'Logo', width: 1, height: 1, dataUrl: 'data:image/png;base64,AA==' } },
  };
  const saved = parseProject(JSON.stringify(project));
  expect(saved.bodies[0].faceMaterials).toEqual(body.faceMaterials);
  expect(() => parseProject(JSON.stringify({ ...project, assets: {} }))).toThrow();
  for (const result of [
    selectionProject(saved, [body.id], 'Tarra'),
    mergeProject(freshProject(), saved).project,
  ]) {
    const surface = result.bodies[0].faceMaterials![0].appearance;
    const [asset] = layerAssetIds(surface);
    expect(asset).not.toBe('logo');
    expect(result.assets![asset]).toEqual(project.assets.logo);
    expect(surface.layers![1].strokes).toEqual(paint.strokes);
    expect(parseProject(JSON.stringify(result))).toEqual(result);
  }
});

it('ships the chipped panel as an editable paint layer over procedural iron', () => {
  const material = defaultAppearance('painted-metal-chipped');
  expect(material.layers![0].kind).toBe('paint');
  expect(material.layers![0].amount).toBeGreaterThan(0);
  expect(defaultAppearance('painted-metal-chipped')).toEqual(material);
});

it('merges rapid edits against the latest layer without restoring stale text or coordinates', () => {
  const observed = { ...newSurfaceLayer('decal'), center: [10, 20] as [number, number] };
  const text = {
    type: 'text' as const,
    text: 'Updated',
    font: 'stencil' as const,
    spacing: 0.04,
    align: 'center' as const,
  };
  const current = { ...observed, decal: text, center: [30, 20] as [number, number] };
  const next = patchSurfaceLayer(
    current,
    { decal: { ...text, text: 'NIVO', font: 'mono' }, center: [10, 40] },
    observed,
  );
  expect(next.decal).toMatchObject({ text: 'Updated', font: 'mono' });
  expect(next.center).toEqual([30, 40]);
});
