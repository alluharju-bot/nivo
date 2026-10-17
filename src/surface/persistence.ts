import { bodySchema, uid, type Body, type Project } from '../model/project';
import {
  defaultAppearance,
  appearancePreset,
  emissionSettings,
  type Appearance,
  type TextureAsset,
} from '../model/materials';
import { mapCanvas } from './SurfaceStage';
import { surfaceBody, sourceStamp } from './mesh';
import type { SurfaceDraft } from './history';
import type { MapChannel, PixelMap } from './maps';

export function saveSurfaceDraft(source: Body, draft: SurfaceDraft, name: string) {
  const replacing = !!source.surfaceWorkflow && !source.component;
  let body = surfaceBody(source, draft.mesh, replacing ? source.id : uid());
  const assets: Record<string, TextureAsset> = {},
    ids: Partial<Record<MapChannel, string>> = {};
  for (const [channel, map] of Object.entries(draft.maps))
    if (map) {
      const id = uid();
      ids[channel as MapChannel] = id;
      assets[id] = {
        name: `${name} · ${channel}`,
        dataUrl: mapCanvas(map).toDataURL('image/png'),
        width: map.size,
        height: map.size,
      };
    }
  const atlasAppearance = (appearance?: Appearance): Appearance => {
    const base = appearance ?? defaultAppearance(source.material),
      preset = appearancePreset(base);
    return {
      ...base,
      // The atlas already contains the overlays sampled from the source material.
      layers: undefined,
      transmission: base.transmission ?? preset.transmission ?? 0,
      ior: base.ior ?? preset.ior ?? 1.5,
      attenuationColor: base.attenuationColor ?? preset.attenuationColor ?? '#ffffff',
      attenuationDistance: base.attenuationDistance ?? preset.attenuationDistance ?? 0,
      clearcoat:
        (base.roughness ?? preset.roughness) === 1 && !base.atlasMaps
          ? 0
          : (base.clearcoat ?? preset.clearcoat ?? 0),
      atlasCoatRoughness: base.atlasCoatRoughness ?? base.roughness ?? preset.roughness,
      emission: emissionSettings(base, source.color),
      preset: 'paint-solid',
      textureTint: 'multiply',
      assetId: ids.color,
      maps: { normal: ids.normal, ao: ids.ao, roughness: ids.roughness, metalness: ids.metalness },
      atlasMaps: true,
      generatedSurface: false,
      surfaceDetail: true,
      normalStrength: 1,
      normalFormat: 'opengl',
      roughness: 1,
      metalness: ids.metalness ? 1 : (appearance?.metalness ?? 0),
      texture: { width: 1, height: 1, offsetX: 0, offsetY: 0, rotation: 0, lockAspect: true },
    };
  };
  if (!draft.atlas && source.appearance?.atlasMaps)
    body = {
      ...body,
      color: '#b8c3c8',
      appearance: defaultAppearance('matte'),
      faceMaterials: undefined,
    };
  if (draft.atlas && ids.color)
    body = {
      ...body,
      color: '#ffffff',
      appearance: atlasAppearance(source.appearance),
      faceMaterials: body.faceMaterials
        ? Object.fromEntries(
            Object.entries(body.faceMaterials).map(([id, m]) => [
              id,
              { ...m, color: '#ffffff', appearance: atlasAppearance(m.appearance) },
            ]),
          )
        : undefined,
    };
  body = bodySchema.parse({
    ...body,
    name: name.trim() || source.name,
    surfaceWorkflow: {
      sourceId: source.surfaceWorkflow?.sourceId ?? source.id,
      sourceStamp: source.surfaceWorkflow?.sourceStamp ?? sourceStamp(source),
      uvAtlas: draft.atlas,
      baked: draft.baked,
      mask: draft.mesh.mask,
      loops: draft.loops,
    },
  });
  return { body, assets, replacing };
}
export async function loadSurfaceMaps(
  body: Body,
  assets: Project['assets'],
): Promise<SurfaceDraft['maps']> {
  if (!body.surfaceWorkflow?.uvAtlas) return {};
  const ids = { color: body.appearance?.assetId, ...body.appearance?.maps },
    result: SurfaceDraft['maps'] = {};
  await Promise.all(
    Object.entries(ids).map(async ([key, id]) => {
      if (
        !id ||
        !['color', 'normal', 'roughness', 'metalness', 'ao'].includes(key) ||
        !assets?.[id]
      )
        return;
      const asset = assets[id],
        image = new Image();
      image.src = asset.dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = asset.width;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      result[key as MapChannel] = {
        size: asset.width,
        pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      } satisfies PixelMap;
    }),
  );
  return result;
}
