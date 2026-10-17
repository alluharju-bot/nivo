import type { Appearance } from './materials';
import type { Body } from './project';
import { defaultAppearance } from './materials';
import { faceMaterialBody } from './faceMaterials';

import type { SurfaceLayer } from './surfaceLayerSchema';
export { surfaceLayerSchema, type SurfaceLayer } from './surfaceLayerSchema';
export const layerNames: Record<SurfaceLayer['kind'], string> = {
  dust: 'Pöly',
  scratches: 'Naarmut',
  fingerprints: 'Sormenjäljet',
  water: 'Vesijäljet',
};
export function newSurfaceLayer(kind: SurfaceLayer['kind']): SurfaceLayer {
  const size = kind === 'fingerprints' ? 120 : kind === 'water' ? 180 : 300;
  return {
    id: crypto.randomUUID(),
    kind,
    enabled: true,
    amount: 0.35,
    width: size,
    height: size,
    rotation: 0,
    color: kind === 'dust' ? '#b9b1a0' : '#d5d1c5',
    seed: 1,
  };
}
export function withSurfaceLayers(appearance: Appearance, layers: SurfaceLayer[]): Appearance {
  const { layers: _, ...base } = appearance;
  return layers.length ? { ...base, layers } : base;
}
/** A whole-part overlay preserves existing face paints, unlike repainting a whole part. */
export function changeSurfaceLayers(
  body: Body,
  change: (layers: SurfaceLayer[]) => SurfaceLayer[],
  face?: number,
): Body {
  const update = (appearance: Appearance) =>
    withSurfaceLayers(appearance, change(appearance.layers ?? []));
  if (face !== undefined) {
    const source = faceMaterialBody(body, face);
    return {
      ...body,
      faceMaterials: {
        ...body.faceMaterials,
        [face]: {
          color: source.color,
          appearance: update(source.appearance ?? defaultAppearance(source.material)),
        },
      },
    };
  }
  return {
    ...body,
    appearance: update(body.appearance ?? defaultAppearance(body.material)),
    ...(body.faceMaterials
      ? {
          faceMaterials: Object.fromEntries(
            Object.entries(body.faceMaterials).map(([index, material]) => [
              index,
              { ...material, appearance: update(material.appearance) },
            ]),
          ),
        }
      : {}),
  };
}
