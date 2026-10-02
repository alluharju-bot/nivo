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
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  transmission: z.number().min(0).max(1).optional(),
  clearcoat: z.number().min(0).max(1).optional(),
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
    'oak' | 'walnut' | 'birch' | 'pine' | 'brushed' | 'granite' | 'marble' | 'slate' | 'travertine';
  seed?: number;
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
];
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
  texture: { ...textureDefaults },
});
