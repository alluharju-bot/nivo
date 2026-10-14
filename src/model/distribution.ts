import { bounds, MAX_PROJECT_BODIES, uid, type Project, type Vec3 } from './project';
import {
  distributionOptionsSchema,
  type Distribution,
  type DistributionOptions,
} from './distributionSchema';
import { translateSelection, groupContains, bodyLocked } from './groups';
import { guidePoints } from './guides';
import { add, sub, unit } from './geometry';
import { selectionUnit, removeSelection } from './selection';

const indexOf = (axis: DistributionOptions['axis']) => 'xyz'.indexOf(axis);
const factors = { min: 0, center: 0.5, max: 1 };
type Interval = { min: number; max: number };

function slots(series: Distribution, count: number) {
  const members: (Distribution['members'][number] | undefined)[] = Array.from(
    { length: count },
    (_, i) => series.members[i],
  );
  // With two selected boundary lines, keep the second boundary as the last line.
  // Later count edits likewise preserve both original boundary identities.
  if (series.kind === 'guides' && series.mode === 'copy' && series.members.length > 1) {
    const last = series.members.at(-1)!;
    for (let i = 1; i < count - 1; i++)
      members[i] = series.members[i] === last ? undefined : series.members[i];
    members[count - 1] = last;
  }
  return members;
}

function memberBounds(
  project: Project,
  series: Distribution,
  member: Distribution['members'][number],
) {
  if (series.kind === 'guides') {
    const guide = project.guides.find((g) => g.id === member.ids[0]);
    const points = guide && guidePoints(project.bodies, guide);
    if (!points) throw new Error('Tasajaon viivaa ei löydy. Tee uusi jako nykyisestä valinnasta.');
    // A guide's placement is its first point, not its visible/infinite extent.
    return { min: points[0], max: points[0] };
  }
  const ids = new Set(member.ids);
  const bodies = project.bodies.filter((b) => ids.has(b.id));
  if (bodies.length !== ids.size)
    throw new Error('Tasajaon osia puuttuu. Tee uusi jako nykyisestä valinnasta.');
  return bounds(bodies);
}

function interval(
  project: Project,
  series: Distribution,
  member: Distribution['members'][number],
  axis: number,
): Interval {
  const box = memberBounds(project, series, member);
  return { min: box.min[axis], max: box.max[axis] };
}

/** Closed assemblies stay together; ordinary folders do not change selection semantics. */
export function distributionMembers(project: Project, ids: string[], openedAssembly?: string) {
  const selected = new Set(ids),
    seen = new Set<string>();
  const members: Distribution['members'] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const member = selectionUnit(project, id, openedAssembly);
    if (!member.ids.length) throw new Error('Valittua osaa ei löydy.');
    if (member.ids.some((key) => !selected.has(key)))
      throw new Error('Valitse koko kokoonpano tai avaa se ennen osien tasajakoa.');
    member.ids.forEach((key) => seen.add(key));
    members.push(member);
  }
  return members;
}

export function newDistribution(
  project: Project,
  kind: Distribution['kind'],
  ids: string[],
  mode: Distribution['mode'],
  groupId?: string,
  openedAssembly?: string,
): Distribution {
  if (!ids.length) throw new Error('Valitse ensin osia, muotoja tai viivoja.');
  let members: Distribution['members'] =
    kind === 'guides'
      ? ids.map((id) => ({ ids: [id] }))
      : mode === 'copy'
        ? [{ ids, groupId }]
        : distributionMembers(project, ids, openedAssembly);
  if (kind === 'guides' && mode === 'copy' && members.length > 2)
    throw new Error('Valitse kopiointiin yksi viiva tai kaksi rinnakkaista rajaviivaa.');
  if (mode === 'arrange' && members.length < 2)
    throw new Error('Järjestäminen tarvitsee vähintään kaksi erillistä osaa tai viivaa.');
  const series: Distribution = {
    id: uid(),
    kind,
    mode,
    members,
    options: {
      axis: 'x',
      reverse: false,
      count: Math.max(2, members.length),
      measure: kind === 'guides' ? 'span' : 'extent',
      value: 1000,
      reference: 'center',
    },
  };
  const spreads = [0, 1, 2].map((axis) => {
    const values = members
      .map((m) => interval(project, series, m, axis))
      .map((b) => (b.min + b.max) / 2);
    return Math.max(...values) - Math.min(...values);
  });
  let axis = spreads.indexOf(Math.max(...spreads));
  if (kind === 'guides' && members.length === 1) {
    const guide = project.guides.find((g) => g.id === ids[0])!;
    const points = guidePoints(project.bodies, guide)!;
    const direction = unit(sub(points[1], points[0]));
    const planeAxes = guide.plane === 'XY' ? [0, 1] : guide.plane === 'XZ' ? [0, 2] : [1, 2];
    axis = planeAxes.reduce((best, i) =>
      Math.abs(direction[i]) < Math.abs(direction[best]) ? i : best,
    );
  }
  series.options.axis = 'xyz'[axis] as DistributionOptions['axis'];
  members = [...members].sort(
    (a, b) => interval(project, series, a, axis).min - interval(project, series, b, axis).min,
  );
  series.members = members;
  if (mode === 'copy' && kind === 'bodies') series.options.count = 5;
  if (mode === 'copy' && kind === 'guides') series.options.count = 6; // five intervals, including both ends
  const first = interval(project, series, members[0], axis),
    last = interval(project, series, members.at(-1)!, axis);
  series.options.value =
    members.length > 1
      ? Math.max(0.1, last.max - first.min)
      : Math.max(1000, (first.max - first.min) * series.options.count * 2);
  return series;
}

export function planDistribution(project: Project, series: Distribution, options = series.options) {
  const parsed = distributionOptionsSchema.safeParse(options);
  if (!parsed.success)
    throw new Error('Anna määrä 2–1 001 ja positiivinen mitta enintään 100 000 mm.');
  const o = parsed.data,
    axis = indexOf(o.axis),
    sign = o.reverse ? -1 : 1;
  if (series.mode === 'arrange' && o.count !== series.members.length)
    throw new Error('Järjestäminen säilyttää valittujen osien määrän. Kopiointi muuttaa määrää.');
  if (!series.members.length) throw new Error('Valitse ensin jaettava osa tai viiva.');
  if (series.kind === 'guides' && ['extent', 'gap'].includes(o.measure))
    throw new Error('Viivoille käytetään kokonaismittaa tai jakoväliä.');
  const sourceBox = memberBounds(project, series, series.members[0]);
  const boxes = slots(series, o.count).map((m) =>
    m ? memberBounds(project, series, m) : sourceBox,
  );
  const items = boxes.map((box) => ({ min: box.min[axis], max: box.max[axis] }));
  if (series.kind === 'bodies') {
    const ids = new Set(series.members.flatMap((m) => m.ids));
    if (project.bodies.some((b) => ids.has(b.id) && bodyLocked(b, project.groups)))
      throw new Error('Vapauta tasajaon osien Hold-lukitus ennen muokkaamista.');
    const total =
      project.bodies.length +
      Math.max(0, o.count - series.members.length) * series.members[0].ids.length;
    if (total > MAX_PROJECT_BODIES)
      throw new Error('Tasajako ylittäisi projektin 10 000 osan rajan.');
  } else {
    if (project.guides.length + Math.max(0, o.count - series.members.length) > 1000)
      throw new Error('Tasajako ylittäisi projektin 1 000 viivan rajan.');
    const first = project.guides.find((g) => g.id === series.members[0].ids[0])!;
    const p = guidePoints(project.bodies, first)!;
    const direction = unit(sub(p[1], p[0]));
    if (Math.abs(direction[axis]) > 1 - 1e-6)
      throw new Error(
        'Valitse viivan poikittainen jakosuunta, jotta viivat eivät mene päällekkäin.',
      );
    for (const m of series.members) {
      const g = project.guides.find((g) => g.id === m.ids[0])!;
      const ends = guidePoints(project.bodies, g)!;
      const d = unit(sub(ends[1], ends[0]));
      if (Math.abs(d.reduce((sum, n, i) => sum + n * direction[i], 0)) < 1 - 1e-6)
        throw new Error('Valitse tasajakoon samansuuntaiset viivat.');
    }
  }
  const widths = items.map((b) => b.max - b.min);
  const ref = (b: Interval) => b.min + (b.max - b.min) * factors[o.reference];
  const first = items[0],
    start = ref(first);
  const leading = o.reverse ? first.max : first.min;
  const sum = widths.reduce((a, b) => a + b, 0);
  const gap = o.measure === 'extent' ? (o.value - sum) / (o.count - 1) : o.value;
  if (o.measure === 'extent' && gap < -1e-6)
    throw new Error(`Osat eivät mahdu: paksuudet vievät yhteensä ${Number(sum.toFixed(3))} mm.`);
  const step = o.measure === 'span' ? o.value / (o.count - 1) : o.value;
  let cursor = leading;
  const placements = items.map((b, i) => {
    let delta: number;
    if (o.measure === 'extent' || o.measure === 'gap') {
      delta = cursor - (o.reverse ? b.max : b.min);
      cursor += sign * (widths[i] + Math.max(0, gap));
    } else delta = start + sign * step * i - ref(b);
    // A copy pattern remains one straight row when its axis is changed later.
    // Arranging existing objects intentionally preserves their other coordinates.
    const offset: Vec3 = series.mode === 'copy' ? sub(sourceBox.min, boxes[i].min) : [0, 0, 0];
    offset[axis] = delta;
    const min = b.min + delta,
      max = b.max + delta;
    if (Math.max(Math.abs(min), Math.abs(max)) > 100000 + 1e-6)
      throw new Error('Tasajako ylittäisi sallitun ±100 000 mm sijaintialueen.');
    return { offset, min, max, reference: ref(b) + delta };
  });
  const gaps = placements
    .slice(1)
    .map((b, i) => (o.reverse ? placements[i].min - b.max : b.min - placements[i].max));
  return {
    placements,
    gapMin: Math.min(...gaps),
    gapMax: Math.max(...gaps),
    extent: Math.max(...placements.map((p) => p.max)) - Math.min(...placements.map((p) => p.min)),
    span: Math.abs(placements.at(-1)!.reference - placements[0].reference),
  };
}

export function matchingDistribution(project: Project, kind: Distribution['kind'], ids: string[]) {
  if (!ids.length) return;
  const existing = new Set((kind === 'bodies' ? project.bodies : project.guides).map((b) => b.id));
  return project.distributions?.find(
    (s) =>
      s.kind === kind &&
      s.members.every((m) => m.ids.every((id) => existing.has(id))) &&
      ids.every((id) => s.members.some((m) => m.ids.includes(id))),
  );
}

/** All copies and placements are one transaction. Existing members retain their IDs and geometry. */
export function applyDistribution(
  project: Project,
  series: Distribution,
  options = series.options,
) {
  const plan = planDistribution(project, series, options);
  let next = project;
  const desired = slots(series, options.count);
  const kept = new Set(desired.flatMap((m) => m?.ids ?? []));
  const removed = series.members.filter((m) => !m.ids.some((id) => kept.has(id))),
    removedIds = new Set(removed.flatMap((m) => m.ids));
  if (series.kind === 'bodies') {
    next = removeSelection(next, [...removedIds]);
    const ownedGroups = removed.flatMap((m) => (m.groupId ? [m.groupId] : []));
    next = {
      ...next,
      groups: next.groups.filter(
        (g) =>
          !ownedGroups.some(
            (id) =>
              groupContains(next.groups, id, g.id) &&
              !next.bodies.some((b) => groupContains(next.groups, g.id, b.groupId)),
          ),
      ),
    };
  } else next = { ...next, guides: next.guides.filter((g) => !removedIds.has(g.id)) };
  const members: Distribution['members'] = [];
  // Clone before moving: every extra instance starts from the unchanged first member.
  for (const member of desired) {
    if (member) {
      members.push(member);
      continue;
    }
    if (series.kind === 'bodies') {
      const copy = translateSelection(next, members[0].ids, [0, 0, 0], true, members[0].groupId);
      next = copy.project;
      members.push({ ids: copy.ids, groupId: copy.groupId });
    } else {
      const source = next.guides.find((g) => g.id === members[0].ids[0])!;
      const id = uid();
      next = { ...next, guides: [...next.guides, { ...source, id }] };
      members.push({ ids: [id] });
    }
  }
  const offsets = new Map(
    members.flatMap((m, i) => m.ids.map((id) => [id, plan.placements[i].offset] as const)),
  );
  next =
    series.kind === 'bodies'
      ? {
          ...next,
          bodies: next.bodies.map((b) =>
            offsets.has(b.id) ? { ...b, origin: add(b.origin, offsets.get(b.id)!) } : b,
          ),
        }
      : {
          ...next,
          guides: next.guides.map((g) => {
            const offset = offsets.get(g.id);
            if (!offset || Math.hypot(...offset) < 1e-8) return g;
            const points = guidePoints(next.bodies, g)!;
            // Explicit translated points prevent the original attachment pulling the copy back.
            return {
              ...g,
              anchor: g.mode === 'guide' ? g.anchor : { point: add(points[0], offset) },
              endAnchor: g.endAnchor ? { point: add(points[1], offset) } : undefined,
              offset: g.mode === 'guide' ? add(g.offset ?? [0, 0, 0], offset) : undefined,
            };
          }),
        };
  const ids = new Set(members.flatMap((m) => m.ids));
  const stored: Distribution = { ...series, options, members };
  next = {
    ...next,
    distributions: [
      ...(next.distributions ?? []).filter(
        (s) =>
          s.id !== series.id &&
          !(s.kind === series.kind && s.members.some((m) => m.ids.some((id) => ids.has(id)))),
      ),
      stored,
    ],
  };
  return { project: next, ids: [...ids], series: stored, plan };
}
