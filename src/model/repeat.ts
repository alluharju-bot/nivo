import { MAX_PROJECT_BODIES, type Project, type Vec3 } from './project';
import { translateSelection } from './groups';
import { scale } from './geometry';

/** Additional repeats from the last result, committed together as one undo step. */
export function repeatTranslation(
  project: Project,
  ids: string[],
  offset: Vec3,
  count: number,
  copy: boolean,
  groupId?: string,
) {
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error('Anna lisätoistojen määrä kokonaislukuna 1–1 000.');
  if (!offset.every(Number.isFinite) || Math.hypot(...offset) < 1e-8)
    throw new Error('Tee ensin siirto tai kopiointi halutulla välillä.');
  const chosen = project.bodies.filter((b) => ids.includes(b.id));
  if (!chosen.length || chosen.length !== new Set(ids).size)
    throw new Error('Toistettavaa valintaa ei enää löydy.');
  if (copy && project.bodies.length + chosen.length * count > MAX_PROJECT_BODIES)
    throw new Error(
      `Toisto ylittäisi projektin ${MAX_PROJECT_BODIES.toLocaleString('fi-FI')} osan rajan. Pienennä määrää.`,
    );
  const total = scale(offset, count);
  if (chosen.some((b) => b.origin.some((n, i) => Math.abs(n + total[i]) > 100_000)))
    throw new Error('Toisto veisi osan sallitun ±100 000 mm sijaintialueen ulkopuolelle.');
  if (!copy) return translateSelection(project, ids, total, false, groupId);
  let result = { project, ids, groupId };
  // Always offset the template by a multiple: decimals do not accumulate drift.
  for (let i = 1; i <= count; i++)
    result = translateSelection(result.project, ids, scale(offset, i), true, groupId);
  return result;
}
