import { expect, it } from 'vitest';
import { experimentalMaterials } from '../model/experimentalMaterials';
import { appearanceSchema, defaultAppearance, findPreset } from '../model/materials';
import { freshProject, makeBody, parseProject } from '../model/project';
import { paintSurface } from '../model/faceMaterials';
import { createMaterialLibrary, setMaterialColor } from './materials';
import { canUpdateSurfaces } from './sceneChanges';

it('renders every experimental material without textures, alpha blending or emissive shortcuts', () => {
  const library = createMaterialLibrary(() => {});
  for (const preset of experimentalMaterials) {
    expect(findPreset(preset.id)).toBe(preset);
    const body = {
      ...makeBody(120, 40, 80),
      color: preset.color,
      appearance: defaultAppearance(preset.id),
    };
    const material = library.create(body);
    expect(material.map).toBeNull();
    expect(material.normalMap).toBeNull();
    expect(material.ior).toBe(preset.ior);
    expect(material.emissiveIntensity).toBe(0);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.transmission).toBe(preset.transmission ?? 0);
    expect(material.attenuationDistance).toBe(preset.attenuationDistance ?? Infinity);
    expect(material.thickness).toBe(40);
    material.dispose();
  }
  library.dispose();
});

it('preserves legacy glass and uses exact millimetres for user optical overrides', () => {
  const library = createMaterialLibrary(() => {});
  const body = { ...makeBody(180, 20, 80), appearance: defaultAppearance('glass-clear') };
  const legacy = library.create(body);
  expect(legacy.ior).toBe(1.5);
  expect(legacy.thickness).toBe(2);
  expect(legacy.attenuationDistance).toBe(Infinity);
  const appearance = {
    ...body.appearance,
    ior: 1.34,
    attenuationDistance: 25,
    attenuationColor: '#ff9966',
  };
  const material = library.create({ ...body, appearance });
  expect(material.ior).toBe(1.34);
  expect(material.attenuationDistance).toBe(25);
  expect(material.attenuationColor.getHexString()).toBe('ff9966');
  expect(material.thickness).toBe(20);
  setMaterialColor(material, '#ccffff');
  expect(material.color.getHexString()).toBe('ccffff');
  expect(material.attenuationColor.getHexString()).toBe('ff9966');
  const disabled = library.create({
    ...body,
    appearance: { ...appearance, attenuationDistance: 0 },
  });
  expect(disabled.attenuationDistance).toBe(Infinity);
  const sheet = library.create({
    ...makeBody(100, 100, 0),
    appearance: defaultAppearance('gel-amber'),
  });
  expect(sheet.thickness).toBe(0);
  expect(sheet.attenuationDistance).toBe(Infinity);
  [legacy, material, disabled, sheet].forEach((m) => m.dispose());
  library.dispose();
});

it('round-trips optics on parts, faces and saved palettes and keeps edits on the geometry fast path', () => {
  const appearance = {
    ...defaultAppearance('gel-amber'),
    ior: 1.37,
    attenuationDistance: 15,
    attenuationColor: '#88ccff',
  };
  const body = paintSurface(
    { ...makeBody(), appearance },
    { ...appearance, attenuationDistance: 0 },
    '#aabbcc',
    2,
  );
  const project = {
    ...freshProject(),
    bodies: [body],
    materials: [{ id: 'gel', name: 'Oma geeli', color: '#ffffff', appearance }],
  };
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  const changed = { ...body, appearance: { ...appearance, ior: 1.8 } };
  expect(canUpdateSurfaces({ bodies: [body], meshes: [] }, { bodies: [changed], meshes: [] })).toBe(
    true,
  );
  expect(defaultAppearance('abs-matte').ior).toBeUndefined();
});

it('rejects optical values that would cause invalid GPU arithmetic', () => {
  for (const value of [
    { ior: 0 },
    { ior: 3 },
    { ior: NaN },
    { attenuationDistance: -1 },
    { attenuationDistance: Infinity },
    { attenuationColor: 'red' },
  ]) {
    expect(
      appearanceSchema.safeParse({ ...defaultAppearance('gel-clear'), ...value }).success,
    ).toBe(false);
  }
});
