import type { Anchor, Body, Guide } from './project';
import { angleBetween, guidePoints, resolveAnchor } from './guides';
import { sub, unit } from './geometry';

export type GuideEndpoint = { guideId: string; end: 0 | 1 };

export function guideEndAnchor(bodies: Body[], guide: Guide, end: 0 | 1): Anchor {
  const points = guidePoints(bodies, guide);
  if (!points) throw new Error('Mittaviivan viite puuttuu.');
  return end === 0 && !guide.offset
    ? guide.anchor
    : end === 1 && guide.endAnchor
      ? guide.endAnchor
      : { point: points[end] };
}

/** Segments are independent even when their endpoints coincide. */
export function moveGuideEndpoint(
  bodies: Body[],
  guides: Guide[],
  target: GuideEndpoint,
  anchor: Anchor,
): Guide[] {
  if (!guides.some((g) => g.id === target.guideId && g.mode === 'free'))
    throw new Error('Mittaviivan pistettä ei enää löydy.');
  return guides.map((guide) => {
    if (guide.id !== target.guideId) return guide;
    const a = target.end === 0 ? anchor : guideEndAnchor(bodies, guide, 0);
    const b = target.end === 1 ? anchor : guideEndAnchor(bodies, guide, 1);
    const start = resolveAnchor(bodies, a),
      end = resolveAnchor(bodies, b);
    if (!start || !end) throw new Error('Mittaviivan viite puuttuu.');
    const delta = sub(end, start),
      length = Math.hypot(...delta);
    if (length < 0.1) throw new Error('Mittaviivan päiden välille tarvitaan vähintään 0,1 mm.');
    return {
      ...guide,
      anchor: a,
      endAnchor: b,
      offset: undefined,
      length,
      direction: unit(delta),
      angle: angleBetween(start, end, guide.plane, true),
    };
  });
}
