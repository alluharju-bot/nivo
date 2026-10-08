import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pbrSurfaces } from './pbrCatalog';
import { appearanceSchema, defaultAppearance, findPreset } from './materials';
import { collectionPaints, surfaceCollectionName, surfaceGroups } from './surfaceCollection';
import { woodGrainRotation } from './textureVariation';
import { makeBody } from './project';

it('bundles all four channels at the source scale with verifiable CC0 provenance', () => {
  const manifest = JSON.parse(readFileSync('public/materials/sources.json', 'utf8'));
  for (const surface of pbrSurfaces) {
    const source = manifest.find((entry: { id: string }) => entry.id === surface.source);
    expect(source.license).toBe('CC0-1.0');
    expect(source.sizeMm).toEqual([surface.size, surface.size]);
    const preset = findPreset(`pbr-${surface.source}`);
    expect(preset.color).toBe('#ffffff'); // Albedo already contains its real color.
    expect(preset.category).toBe(surfaceCollectionName);
    expect(surfaceGroups).toContain(preset.collectionGroup);
    expect(defaultAppearance(preset.id).texture.width).toBe(surface.size);
    for (const channel of ['color', 'normal', 'roughness', 'height']) {
      const map = source.maps[channel];
      const bytes = readFileSync(`public/materials/${map.file}`);
      expect(createHash('md5').update(bytes).digest('hex')).toBe(map.md5);
    }
  }
});

it('aligns every photographed wood grain with the long edge of a panel', () => {
  for (const surface of pbrSurfaces.filter((surface) => surface.group === 'Puut')) {
    expect(['u', 'v']).toContain(surface.grainAxis);
    const body = {
      ...makeBody(1000, 100, 18),
      appearance: defaultAppearance(`pbr-${surface.source}`),
    };
    expect(woodGrainRotation(body)).toBe(surface.grainAxis === 'u' ? 0 : 90);
  }
  expect(findPreset('pbr-white_oak_veneer').grainAxis).toBe('v');
  expect(findPreset('pbr-ash_veneer').grainAxis).toBe('u');
});

it('offers matte paint colours without changing the texture or material of older presets', () => {
  for (const paint of collectionPaints) {
    const preset = findPreset(`collection-paint-${paint.id}`);
    expect(preset).toMatchObject({
      category: surfaceCollectionName,
      collectionGroup: 'Maalit',
      color: paint.color,
      roughness: 1,
      clearcoat: 0,
    });
    expect(preset.pbr).toBeUndefined();
    expect(preset.pattern).toBeUndefined();
  }
  expect(findPreset('oak')).toMatchObject({
    category: 'Massiivipuut',
    color: '#bc915f',
    pattern: 'oak',
  });
  expect(findPreset('paint-solid').category).toBe('Maalit');
});

it('preserves legacy tint behaviour on saved PBR materials and defaults new choices to colour replacement', () => {
  const current = defaultAppearance('pbr-coated_pine');
  expect(current.textureTint).toBe('colorize');
  const { textureTint: _, ...legacy } = current;
  expect(appearanceSchema.parse(legacy).textureTint).toBeUndefined();
  expect(appearanceSchema.parse({ ...current, textureTint: 'multiply' }).textureTint).toBe(
    'multiply',
  );
});
