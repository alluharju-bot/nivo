import type { Body, Guide } from './project';
import { guidePoints, resolveAnchor, angleBetween } from './guides';
import { guideEndAnchor } from './guideEditing';
import { dot, sub, unit, scale } from './geometry';

// Physical tolerance in millimetres; zoom and the placement grid never merge nearby lines.
const EPSILON = 1e-5;

/** Union overlapping finite measurements. A shared endpoint alone is not an overlap. */
export function upsertGuide(bodies: Body[], guides: Guide[], candidate: Guide) {
  candidate = { ...guides.find((g) => g.id === candidate.id), ...candidate };
  const replace = (guide: Guide, absorbed: Set<string>) => {
    const next = guides.flatMap((g) =>
      g.id === guide.id ? [guide] : absorbed.has(g.id) ? [] : [g],
    );
    if (!guides.some((g) => g.id === guide.id)) next.push(guide);
    return {
      guides: next,
      guide,
      unchanged: false,
      merged: absorbed.size > (absorbed.has(candidate.id) ? 1 : 0),
    };
  };
  if (candidate.mode !== 'free') return replace(candidate, new Set([candidate.id]));
  const points = guidePoints(bodies, candidate);
  if (!points) throw new Error('Mittaviivan viite puuttuu.');
  const [origin, end] = points,
    length = Math.hypot(...sub(end, origin));
  if (length < 0.1) throw new Error('Mittaviivan päiden välille tarvitaan vähintään 0,1 mm.');
  const direction = unit(sub(end, origin));
  const interval = (guide: Guide) => {
    const ends = guidePoints(bodies, guide);
    if (!ends) return;
    const coordinates = ends.map((p) => dot(sub(p, origin), direction));
    if (
      Math.abs(coordinates[1] - coordinates[0]) < EPSILON ||
      ends.some(
        (p, i) => Math.hypot(...sub(sub(p, origin), scale(direction, coordinates[i]))) > EPSILON,
      )
    )
      return;
    const forward = coordinates[0] <= coordinates[1];
    return {
      guide,
      min: Math.min(...coordinates),
      max: Math.max(...coordinates),
      from: guideEndAnchor(bodies, guide, forward ? 0 : 1),
      to: guideEndAnchor(bodies, guide, forward ? 1 : 0),
    };
  };
  const source = interval(candidate)!;
  const intervals = [
    source,
    ...guides
      .filter(
        (g) =>
          g.id !== candidate.id &&
          g.mode === 'free' &&
          !g.hidden &&
          !candidate.hidden &&
          g.label === candidate.label,
      )
      .flatMap((g) => {
        const span = interval(g);
        return span ? [span] : [];
      }),
  ].sort((a, b) => a.min - b.min);
  // Sorted interval components handle backtracking and a new stroke spanning several old strokes.
  let component: typeof intervals = [],
    max = -Infinity;
  for (const span of intervals) {
    if (component.length && span.min >= max - EPSILON) {
      if (component.includes(source)) break;
      component = [];
    }
    if (!component.length) max = span.max;
    else max = Math.max(max, span.max);
    component.push(span);
  }
  const matches = component.filter((span) => span !== source);
  if (!matches.length) return replace(candidate, new Set([candidate.id]));
  const ids = new Set(matches.map((span) => span.guide.id));
  const editing = guides.some((g) => g.id === candidate.id);
  const keeper = editing ? candidate : guides.find((g) => ids.has(g.id))!;
  const kept = interval(keeper)!;
  const low = component.reduce((a, b) => (b.min < a.min - EPSILON ? b : a), kept);
  const high = component.reduce((a, b) => (b.max > a.max + EPSILON ? b : a), kept);
  // Repeating or tracing inside a single existing measurement changes neither anchors nor history.
  if (!editing && matches.length === 1 && low === kept && high === kept)
    return { guides, guide: keeper, unchanged: true, merged: false };
  const keeperPoints = guidePoints(bodies, keeper)!;
  const forward = dot(sub(keeperPoints[1], keeperPoints[0]), direction) >= 0;
  const anchor = forward ? low.from : high.to,
    endAnchor = forward ? high.to : low.from;
  const startPoint = resolveAnchor(bodies, anchor)!,
    endPoint = resolveAnchor(bodies, endAnchor)!;
  const delta = sub(endPoint, startPoint);
  const merged: Guide = {
    ...keeper,
    anchor,
    endAnchor,
    offset: undefined,
    length: Math.hypot(...delta),
    direction: unit(delta),
    angle: angleBetween(startPoint, endPoint, keeper.plane, true),
    ...(component.some((s) => s.guide.xray) ? { xray: true } : {}),
  };
  ids.add(candidate.id);
  return replace(merged, ids);
}
