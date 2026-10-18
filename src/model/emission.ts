import type { Body, Vec3 } from './project';
import { defaultAppearance, emissionSettings, type Emission } from './materials';
import { faceMaterialBody, paintSurface } from './faceMaterials';

export function emissionDirection(emission: Emission): Vec3 {
  if (emission.aim) {
    const length = Math.hypot(...emission.aim);
    return emission.aim.map((n) => n / length) as Vec3;
  }
  const direction: Vec3 = [0, 0, 0];
  direction['xyz'.indexOf(emission.direction.slice(-1))] = emission.direction.startsWith('-')
    ? -1
    : 1;
  return direction;
}

/** Light edits preserve the material, texture placement and other face finishes. */
export function changeEmission(body: Body, patch: Partial<Emission>, face?: number): Body {
  const source = faceMaterialBody(body, face);
  const appearance = source.appearance ?? defaultAppearance(source.material);
  const next = {
    ...appearance,
    emission: { ...emissionSettings(appearance, source.color), ...patch },
  };
  return face === undefined
    ? { ...body, appearance: next }
    : paintSurface(body, next, source.color, face);
}
