import { z } from 'zod';
export const texturePlacementSchema = z.object({
  width: z.number().min(0.1).max(100000),
  height: z.number().min(0.1).max(100000),
  offsetX: z.number().finite().min(-100000).max(100000),
  offsetY: z.number().finite().min(-100000).max(100000),
  rotation: z.number().finite().min(-360000).max(360000),
  lockAspect: z.boolean(),
});
export const appearanceSchema = z.object({
  preset: z.string().min(1).max(100),
  assetId: z.string().max(100).optional(),
  maps: z
    .object({
      normal: z.string().max(100).optional(),
      bump: z.string().max(100).optional(),
      roughness: z.string().max(100).optional(),
      metalness: z.string().max(100).optional(),
    })
    .optional(),
  normalStrength: z.number().min(0).max(5).optional(),
  surfaceDetail: z.boolean().optional(),
  generatedSurface: z.boolean().optional(),
  bumpDepth: z.number().min(0).max(20).optional(),
  normalFormat: z.enum(['opengl', 'directx']).optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  transmission: z.number().min(0).max(1).optional(),
  clearcoat: z.number().min(0).max(1).optional(),
  emission: z
    .object({
      enabled: z.boolean(),
      type: z.enum(['surface', 'spot']),
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      intensity: z.number().min(0).max(100),
      angle: z.number().min(5).max(160),
      direction: z.enum(['x', '-x', 'y', '-y', 'z', '-z']),
    })
    .optional(),
  texture: texturePlacementSchema,
});
export const assetSchema = z.object({
  name: z.string().max(200),
  dataUrl: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
});
export const customMaterialSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  appearance: appearanceSchema,
});
export type Appearance = z.infer<typeof appearanceSchema>;
export type TexturePlacement = z.infer<typeof texturePlacementSchema>;
export type TextureAsset = z.infer<typeof assetSchema>;
export type CustomMaterial = z.infer<typeof customMaterialSchema>;
export const textureDefaults: TexturePlacement = {
  width: 300,
  height: 600,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  lockAspect: true,
};
export type MaterialPreset = {
  id: string;
  name: string;
  category: string;
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  clearcoat?: number;
  pattern?:
    | 'oak'
    | 'walnut'
    | 'birch'
    | 'pine'
    | 'brushed'
    | 'granite'
    | 'marble'
    | 'slate'
    | 'travertine'
    | 'micro'
    | 'fiber'
    | 'plaster'
    | 'concrete'
    | 'limestone'
    | 'sandstone'
    | 'terrazzo'
    | 'tile';
  /** Physical repeat size and relief in millimetres. */
  size?: [number, number];
  relief?: number;
  seed?: number;
  emission?: number;
};
const wood = (
  id: string,
  name: string,
  color: string,
  pattern: MaterialPreset['pattern'],
  seed: number,
): MaterialPreset => ({
  id,
  name,
  category: 'Massiivipuut',
  color,
  roughness: 0.48,
  metalness: 0,
  clearcoat: 0.12,
  pattern,
  seed,
});
export const materialPresets: MaterialPreset[] = [
  wood('oak', 'Luonnontammi', '#bc915f', 'oak', 1),
  wood('oak-light', 'Vaalea tammi', '#e1c8a2', 'oak', 2),
  wood('oak-smoked', 'Savutammi', '#715440', 'oak', 3),
  wood('walnut', 'Pähkinä', '#72503a', 'walnut', 4),
  wood('birch', 'Koivu', '#e4d0a9', 'birch', 5),
  wood('pine', 'Mänty', '#d9b880', 'pine', 6),
  {
    id: 'aluminum',
    name: 'Harjattu alumiini',
    category: 'Metallit',
    color: '#c4c9cf',
    roughness: 0.32,
    metalness: 1,
    pattern: 'brushed',
  },
  {
    id: 'steel',
    name: 'Harjattu ruostumaton teräs',
    category: 'Metallit',
    color: '#a8afb6',
    roughness: 0.25,
    metalness: 1,
    pattern: 'brushed',
    seed: 2,
  },
  {
    id: 'chrome',
    name: 'Kromi',
    category: 'Metallit',
    color: '#d4d9df',
    roughness: 0.06,
    metalness: 1,
  },
  {
    id: 'brass',
    name: 'Messinki',
    category: 'Metallit',
    color: '#be954e',
    roughness: 0.25,
    metalness: 1,
  },
  {
    id: 'glass-clear',
    name: 'Kirkas lasi',
    category: 'Lasit',
    color: '#f1fcff',
    roughness: 0.03,
    metalness: 0,
    transmission: 0.98,
  },
  {
    id: 'glass-smoked',
    name: 'Savulasi',
    category: 'Lasit',
    color: '#707d83',
    roughness: 0.08,
    metalness: 0,
    transmission: 0.9,
  },
  {
    id: 'glass-frosted',
    name: 'Huurrelasi',
    category: 'Lasit',
    color: '#e7eef0',
    roughness: 0.5,
    metalness: 0,
    transmission: 0.9,
  },
  {
    id: 'abs-matte',
    name: 'Matta ABS',
    category: 'Muovit',
    color: '#667177',
    roughness: 0.7,
    metalness: 0,
  },
  {
    id: 'abs-gloss',
    name: 'Kiiltävä ABS',
    category: 'Muovit',
    color: '#d2d7db',
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.8,
  },
  {
    id: 'acrylic-clear',
    name: 'Kirkas akryyli',
    category: 'Muovit',
    color: '#f5faff',
    roughness: 0.07,
    metalness: 0,
    transmission: 0.96,
  },
  {
    id: 'acrylic-frosted',
    name: 'Huurteinen akryyli',
    category: 'Muovit',
    color: '#e3e8ec',
    roughness: 0.55,
    metalness: 0,
    transmission: 0.8,
  },
  {
    id: 'granite',
    name: 'Graniitti',
    category: 'Kivet',
    color: '#a4a1a0',
    roughness: 0.38,
    metalness: 0,
    pattern: 'granite',
  },
  {
    id: 'marble',
    name: 'Marmori',
    category: 'Kivet',
    color: '#f1ede4',
    roughness: 0.22,
    metalness: 0,
    pattern: 'marble',
    clearcoat: 0.2,
  },
  {
    id: 'slate',
    name: 'Liuskekivi',
    category: 'Kivet',
    color: '#424b50',
    roughness: 0.88,
    metalness: 0,
    pattern: 'slate',
  },
  {
    id: 'travertine',
    name: 'Travertiini',
    category: 'Kivet',
    color: '#cbbb9d',
    roughness: 0.72,
    metalness: 0,
    pattern: 'travertine',
  },
  {
    id: 'porcelain-gloss',
    name: 'Kiiltävä valkoinen posliini',
    category: 'Posliini',
    color: '#f4f4ef',
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
  },
  {
    id: 'porcelain-matte',
    name: 'Matta valkoinen posliini',
    category: 'Posliini',
    color: '#efeee8',
    roughness: 0.55,
    metalness: 0,
  },
  {
    id: 'porcelain-dark',
    name: 'Tumma lasitettu posliini',
    category: 'Posliini',
    color: '#263638',
    roughness: 0.15,
    metalness: 0,
    clearcoat: 1,
  },
  {
    id: 'melamine',
    name: 'Valkoinen melamiini',
    category: 'Kalustepinnat',
    color: '#eeeee7',
    roughness: 0.48,
    metalness: 0,
  },
  {
    id: 'laminate',
    name: 'Harmaa laminaatti',
    category: 'Kalustepinnat',
    color: '#999f9d',
    roughness: 0.55,
    metalness: 0,
  },
  {
    id: 'furniture-paint',
    name: 'Maalattu kalustepinta',
    category: 'Kalustepinnat',
    color: '#bcc8ba',
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.35,
  },
  {
    id: 'led-warm',
    name: 'LED · lämmin valkoinen',
    category: 'Valot',
    color: '#ffce8d',
    roughness: 0.4,
    metalness: 0,
    emission: 8,
  },
  {
    id: 'led-neutral',
    name: 'LED · neutraali valkoinen',
    category: 'Valot',
    color: '#fff2df',
    roughness: 0.4,
    metalness: 0,
    emission: 8,
  },
  {
    id: 'led-cool',
    name: 'LED · viileä valkoinen',
    category: 'Valot',
    color: '#d4e7ff',
    roughness: 0.4,
    metalness: 0,
    emission: 8,
  },
];
materialPresets.push(
  {
    id: 'melamine-warm-white',
    name: 'Melamiini · lämmin valkoinen',
    category: 'Melamiinit',
    color: '#eeece2',
    roughness: 0.55,
    metalness: 0,
    pattern: 'micro',
    seed: 41,
  },
  {
    id: 'melamine-cool-white',
    name: 'Melamiini · puhdas valkoinen',
    category: 'Melamiinit',
    color: '#f3f4f1',
    roughness: 0.48,
    metalness: 0,
    pattern: 'micro',
    seed: 42,
  },
  {
    id: 'melamine-grey',
    name: 'Melamiini · vaaleanharmaa',
    category: 'Melamiinit',
    color: '#b9bcb9',
    roughness: 0.55,
    metalness: 0,
    pattern: 'micro',
    seed: 43,
  },
  {
    id: 'melamine-graphite',
    name: 'Melamiini · grafiitti',
    category: 'Melamiinit',
    color: '#414644',
    roughness: 0.6,
    metalness: 0,
    pattern: 'micro',
    seed: 44,
  },
  {
    id: 'melamine-oak',
    name: 'Melamiini · tammikuvio',
    category: 'Melamiinit',
    color: '#c6a77a',
    roughness: 0.52,
    metalness: 0,
    pattern: 'oak',
    seed: 45,
  },
  {
    id: 'mdf-raw',
    name: 'MDF · käsittelemätön',
    category: 'Kalustelevyt',
    color: '#b59c75',
    roughness: 0.92,
    metalness: 0,
    pattern: 'fiber',
    seed: 46,
  },
  {
    id: 'mdf-painted',
    name: 'MDF · maalattu valkoinen',
    category: 'Kalustelevyt',
    color: '#ebece7',
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.25,
    pattern: 'micro',
    seed: 47,
  },
  {
    id: 'plywood-birch',
    name: 'Koivuvaneri · pinta',
    category: 'Kalustelevyt',
    color: '#decda8',
    roughness: 0.56,
    metalness: 0,
    pattern: 'birch',
    seed: 48,
  },
  {
    id: 'particleboard',
    name: 'Lastulevy · käsittelemätön',
    category: 'Kalustelevyt',
    color: '#bda781',
    roughness: 0.95,
    metalness: 0,
    pattern: 'fiber',
    seed: 49,
  },
  {
    id: 'laminate-matte',
    name: 'Laminaatti · mattamusta',
    category: 'Kalustelevyt',
    color: '#292d2c',
    roughness: 0.72,
    metalness: 0,
    pattern: 'micro',
    seed: 50,
  },
);

materialPresets.push(
  {
    id: 'gypsum-smooth',
    name: 'Maalattu kipsi · sileä',
    category: 'Seinäpinnat',
    color: '#efede7',
    roughness: 0.68,
    metalness: 0,
    pattern: 'plaster',
    seed: 61,
    relief: 0.06,
    size: [1000, 1000],
  },
  {
    id: 'gypsum-rough',
    name: 'Maalattu kipsi · karkea',
    category: 'Seinäpinnat',
    color: '#e9e6de',
    roughness: 0.9,
    metalness: 0,
    pattern: 'plaster',
    seed: 62,
    relief: 0.65,
    size: [1000, 1000],
  },
  {
    id: 'skimcoat',
    name: 'Tasoitettu seinä',
    category: 'Seinäpinnat',
    color: '#e3dfd4',
    roughness: 0.94,
    metalness: 0,
    pattern: 'plaster',
    seed: 63,
    relief: 0.18,
    size: [1000, 1000],
  },
  {
    id: 'concrete-raw',
    name: 'Raaka betoni',
    category: 'Betonit',
    color: '#a9a59c',
    roughness: 0.95,
    metalness: 0,
    pattern: 'concrete',
    seed: 64,
    relief: 2,
    size: [1000, 1000],
  },
  {
    id: 'concrete-troweled',
    name: 'Liipattu betoni',
    category: 'Betonit',
    color: '#b1afa7',
    roughness: 0.32,
    metalness: 0,
    pattern: 'concrete',
    seed: 65,
    relief: 0.08,
    size: [1000, 1000],
  },
  {
    id: 'limestone',
    name: 'Kalkkikivi',
    category: 'Kivet',
    color: '#dbd0b8',
    roughness: 0.75,
    metalness: 0,
    pattern: 'limestone',
    seed: 66,
    relief: 0.35,
    size: [600, 600],
  },
  {
    id: 'sandstone',
    name: 'Hiekkakivi',
    category: 'Kivet',
    color: '#c6aa7d',
    roughness: 0.9,
    metalness: 0,
    pattern: 'sandstone',
    seed: 67,
    relief: 0.6,
    size: [600, 600],
  },
  {
    id: 'black-marble',
    name: 'Musta marmori',
    category: 'Kivet',
    color: '#3b3e40',
    roughness: 0.16,
    metalness: 0,
    pattern: 'marble',
    seed: 68,
    relief: 0.025,
    size: [600, 600],
    clearcoat: 0.4,
  },
  {
    id: 'terrazzo',
    name: 'Terrazzo · vaalea',
    category: 'Kivet',
    color: '#d4cfc3',
    roughness: 0.32,
    metalness: 0,
    pattern: 'terrazzo',
    seed: 69,
    relief: 0.025,
    size: [600, 600],
  },
  {
    id: 'tile-white-gloss',
    name: 'Laatta · valkoinen kiiltävä',
    category: 'Laatat',
    color: '#f5f2e9',
    roughness: 0.15,
    metalness: 0,
    pattern: 'tile',
    seed: 70,
    relief: 1.2,
    size: [300, 600],
    clearcoat: 0.4,
  },
  {
    id: 'tile-grey-matte',
    name: 'Laatta · harmaa matta',
    category: 'Laatat',
    color: '#aaa9a3',
    roughness: 0.76,
    metalness: 0,
    pattern: 'tile',
    seed: 71,
    relief: 1.2,
    size: [600, 600],
  },
  {
    id: 'tile-terracotta',
    name: 'Laatta · terrakotta',
    category: 'Laatat',
    color: '#bd7957',
    roughness: 0.85,
    metalness: 0,
    pattern: 'tile',
    seed: 72,
    relief: 1.8,
    size: [200, 200],
  },
  {
    id: 'walnut-oiled',
    name: 'Pähkinä · öljytty',
    category: 'Massiivipuut',
    color: '#886345',
    roughness: 0.32,
    metalness: 0,
    pattern: 'walnut',
    seed: 73,
    relief: 0.08,
    size: [300, 600],
    clearcoat: 0.4,
  },
);

export const legacyPresets: MaterialPreset[] = [
  {
    id: 'matte',
    name: 'Matta',
    category: 'Perusmateriaalit',
    color: '#c3a57e',
    roughness: 0.78,
    metalness: 0,
  },
  {
    id: 'paint',
    name: 'Maalattu',
    category: 'Perusmateriaalit',
    color: '#c3a57e',
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.3,
  },
  { ...materialPresets[0], id: 'wood', name: 'Puu', category: 'Perusmateriaalit' },
  { ...materialPresets[6], id: 'metal', name: 'Metalli', category: 'Perusmateriaalit' },
  { ...materialPresets[10], id: 'glass', name: 'Lasi', category: 'Perusmateriaalit' },
];
export const findPreset = (id: string) =>
  [...materialPresets, ...legacyPresets].find((p) => p.id === id) ?? legacyPresets[0];
export const defaultAppearance = (preset = 'matte'): Appearance => ({
  preset,
  texture: {
    ...textureDefaults,
    width: findPreset(preset).size?.[0] ?? textureDefaults.width,
    height: findPreset(preset).size?.[1] ?? textureDefaults.height,
  },
});
export function emissionSettings(appearance: Appearance, color: string) {
  const preset = findPreset(appearance.preset);
  return (
    appearance.emission ?? {
      enabled: !!preset.emission,
      type: 'surface' as const,
      color: preset.emission ? preset.color : color,
      intensity: preset.emission ?? 8,
      angle: 45,
      direction: '-z' as const,
    }
  );
}

/** Millimetres from black to white; printed wood decor stays much flatter than solid wood. */
export function surfaceDepth(preset: MaterialPreset) {
  if (preset.relief !== undefined) return preset.relief;
  if (preset.category === 'Melamiinit' || preset.id.startsWith('melamine')) return 0.04;
  if (preset.pattern === 'micro' || preset.pattern === 'brushed') return 0.025;
  if (preset.pattern === 'marble' || preset.pattern === 'granite') return 0.04;
  if (preset.pattern === 'slate' || preset.pattern === 'travertine') return 0.6;
  if (preset.pattern === 'fiber') return 0.25;
  return 0.2;
}

export const lightPresets = [
  {
    id: 'led-warm',
    name: 'LED · lämmin 2700 K',
    color: '#ffe0b1',
    type: 'surface',
    intensity: 8,
    angle: 45,
  },
  {
    id: 'led-neutral',
    name: 'LED · neutraali 4000 K',
    color: '#fff1df',
    type: 'surface',
    intensity: 8,
    angle: 45,
  },
  {
    id: 'backlight',
    name: 'Taustavalo · pehmeä',
    color: '#ffe7c7',
    type: 'surface',
    intensity: 4,
    angle: 60,
  },
  {
    id: 'spot-warm',
    name: 'Spotti · lämmin 3000 K',
    color: '#ffe6c5',
    type: 'spot',
    intensity: 12,
    angle: 36,
  },
  {
    id: 'spot-neutral',
    name: 'Spotti · neutraali 4000 K',
    color: '#fff1df',
    type: 'spot',
    intensity: 12,
    angle: 60,
  },
] as const;

export function surfaceStrength(appearance: Appearance) {
  const legacy =
    appearance.maps?.normal || (appearance.maps?.bump && appearance.bumpDepth === undefined);
  return (
    appearance.normalStrength ??
    (legacy ? (findPreset(appearance.preset).pattern === 'micro' ? 0.2 : 0.6) : 1)
  );
}
