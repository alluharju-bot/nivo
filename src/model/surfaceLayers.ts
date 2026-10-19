import type { Appearance } from './materials';
import type { Body } from './project';
import { defaultDecal } from './decals';
import { defaultAppearance } from './materials';
import { faceMaterialBody } from './faceMaterials';

import type { SurfaceLayer } from './surfaceLayerSchema';
export { surfaceLayerSchema, type SurfaceLayer } from './surfaceLayerSchema';
export const layerNames: Record<SurfaceLayer['kind'], string> = {
  dust: 'Pöly',
  scratches: 'Naarmut',
  fingerprints: 'Sormenjäljet',
  water: 'Vesijäljet',
  paint: 'Lohkeileva maali',
  decal: 'Tarra / kuvio',
};
/** Preserve concurrent text/placement edits made before the previous commit finished. */
export function patchSurfaceLayer(
  current: SurfaceLayer,
  patch: Partial<SurfaceLayer>,
  observed?: SurfaceLayer,
): SurfaceLayer {
  const next = { ...current, ...patch };
  if (
    patch.decal &&
    current.decal &&
    observed?.decal &&
    patch.decal.type === observed.decal.type &&
    current.decal.type === observed.decal.type
  ) {
    next.decal = {
      ...current.decal,
      ...Object.fromEntries(
        Object.entries(patch.decal).filter(
          ([key, value]) =>
            JSON.stringify(value) !==
            JSON.stringify((observed.decal as unknown as Record<string, unknown>)[key]),
        ),
      ),
    } as SurfaceLayer['decal'];
  }
  if (patch.center && current.center && observed?.center)
    next.center = patch.center.map((n, i) =>
      n !== observed.center![i] ? n : current.center![i],
    ) as [number, number];
  return next;
}
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
    color: kind === 'paint' ? '#537c78' : kind === 'dust' ? '#b9b1a0' : '#d5d1c5',
    seed: 1,
    ...(kind === 'paint' ? { chipSize: 30, roughness: 0.65 } : {}),
    ...(kind === 'decal'
      ? {
          decal: defaultDecal(),
          width: 160,
          height: 60,
          amount: 1,
          color: '#ffffff',
          roughness: 0.8,
          wear: 0,
          relief: 0,
        }
      : {}),
  };
}

/** Replacing the substrate never discards layers, including independent face layers. */
export function changeLayerBase(
  body: Body,
  appearance: Appearance,
  color: string,
  face?: number,
): Body {
  const update = (source: Appearance | undefined) =>
    withSurfaceLayers(
      {
        ...appearance,
        ...(source?.surfaceMapping ? { surfaceMapping: source.surfaceMapping } : {}),
      },
      source?.layers ?? [],
    );
  if (face !== undefined) {
    const source = faceMaterialBody(body, face);
    return {
      ...body,
      faceMaterials: {
        ...body.faceMaterials,
        [face]: { color, appearance: update(source.appearance) },
      },
    };
  }
  return {
    ...body,
    color,
    appearance: update(body.appearance),
    ...(body.faceMaterials
      ? {
          faceMaterials: Object.fromEntries(
            Object.entries(body.faceMaterials).map(([id, material]) => [
              id,
              { color, appearance: update(material.appearance) },
            ]),
          ),
        }
      : {}),
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
