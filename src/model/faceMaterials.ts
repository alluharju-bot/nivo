import type { Body } from './project';
import type { Appearance } from './materials';

export type PaintScope = 'body' | 'face';
export type FaceMaterial = NonNullable<Body['faceMaterials']>[string];

/** Resolve a face's independent finish without changing the part's base material. */
export function faceMaterialBody(body: Body, index?: number): Body {
  const material = index === undefined ? undefined : body.faceMaterials?.[index];
  return material ? { ...body, ...material, material: undefined } : body;
}

export function paintSurface(
  body: Body,
  appearance: Appearance,
  color: string,
  index?: number,
): Body {
  return index === undefined
    ? { ...body, appearance, color, faceMaterials: undefined }
    : { ...body, faceMaterials: { ...body.faceMaterials, [index]: { appearance, color } } };
}

/** Rigid transforms retain CAD traversal order; affine transforms provide a face map. */
export function remapFaceMaterials(materials: Body['faceMaterials'], map?: number[]) {
  if (!materials || !map) return materials;
  return Object.fromEntries(
    Object.entries(materials).flatMap(([index, material]) =>
      map[Number(index)] === undefined ? [] : [[map[Number(index)], material]],
    ),
  );
}
