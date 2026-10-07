import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pbrSurfaces } from './pbrCatalog';
import { defaultAppearance, findPreset } from './materials';

it('bundles all four channels at the source scale with verifiable CC0 provenance', () => {
  const manifest = JSON.parse(readFileSync('public/materials/sources.json', 'utf8'));
  for (const surface of pbrSurfaces) {
    const source = manifest.find((entry: { id: string }) => entry.id === surface.source);
    expect(source.license).toBe('CC0-1.0');
    expect(source.sizeMm).toEqual([surface.size, surface.size]);
    const preset = findPreset(`pbr-${surface.source}`);
    expect(preset.color).toBe('#ffffff'); // Albedo already contains its real color.
    expect(defaultAppearance(preset.id).texture.width).toBe(surface.size);
    for (const channel of ['color', 'normal', 'roughness', 'height']) {
      const map = source.maps[channel];
      const bytes = readFileSync(`public/materials/${map.file}`);
      expect(createHash('md5').update(bytes).digest('hex')).toBe(map.md5);
    }
  }
});
