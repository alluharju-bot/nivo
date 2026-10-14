import { describe, expect, it } from 'vitest';
import { makeBody, freshProject, parseProject, type Guide } from './project';
import {
  applyDistribution,
  matchingDistribution,
  newDistribution,
  planDistribution,
} from './distribution';
import { guidePoints } from './guides';
import { mergeProject, selectionProject } from './projectImport';
import { removeSelection } from './selection';
import { History } from './history';

it('fits mixed thicknesses to an outer span with equal clear gaps, keeping other coordinates and identities', () => {
  const bodies = [
    makeBody(18, 50, 100, [10, 3, -8]),
    makeBody(38, 50, 100, [90, 4, -7]),
    makeBody(48, 50, 100, [220, 5, -6]),
  ];
  const p = { ...freshProject(), bodies };
  const s = newDistribution(
    p,
    'bodies',
    bodies.map((b) => b.id),
    'arrange',
  );
  const r = applyDistribution(p, s, { ...s.options, value: 304 });
  expect(r.project.bodies.map((b) => b.origin)).toEqual([
    [10, 3, -8],
    [128, 4, -7],
    [266, 5, -6],
  ]);
  expect(r.plan.gapMin).toBe(100);
  expect(r.plan.gapMax).toBe(100);
  expect(r.plan.extent).toBe(304);
  expect(r.project.bodies.map((b) => b.id)).toEqual(bodies.map((b) => b.id));
  expect(r.project.bodies.map((b) => b.feature)).toEqual(bodies.map((b) => b.feature));
});

describe.each(['min', 'center', 'max'] as const)('reference %s', (reference) => {
  it.each([false, true])('positions references exactly in either direction (%s)', (reverse) => {
    const bodies = [
      makeBody(80, 50, 18, [0, 0, 20]),
      makeBody(80, 50, 38, [0, 0, 200]),
      makeBody(80, 50, 48, [0, 0, 400]),
    ];
    const p = { ...freshProject(), bodies },
      s = newDistribution(
        p,
        'bodies',
        bodies.map((b) => b.id),
        'arrange',
      );
    const r = applyDistribution(p, s, {
      ...s.options,
      axis: 'z',
      measure: 'span',
      value: 1000,
      reference,
      reverse,
    });
    const f = { min: 0, center: 0.5, max: 1 }[reference];
    const starts = r.project.bodies.map((b) => b.origin[2] + b.feature.height * f);
    expect(starts).toEqual([
      20 + 18 * f,
      20 + 18 * f + (reverse ? -500 : 500),
      20 + 18 * f + (reverse ? -1000 : 1000),
    ]);
    expect(r.project.bodies[0].origin).toEqual(bodies[0].origin);
  });
});

it('copies arbitrary planar profiles, preserves links, and edits a saved distribution without duplicate instances', () => {
  const body = makeBody(20, 50, 0, [12.5, 20, 0]);
  const p = { ...freshProject(), bodies: [body] },
    s = newDistribution(p, 'bodies', [body.id], 'copy');
  const first = applyDistribution(p, s, { ...s.options, count: 10, measure: 'span', value: 900 });
  const saved = parseProject(JSON.stringify(first.project));
  expect(saved.bodies).toHaveLength(10);
  expect(saved.bodies.map((b) => b.origin[0])).toEqual(
    Array.from({ length: 10 }, (_, i) => 12.5 + i * 100),
  );
  expect(new Set(saved.bodies.map((b) => b.component?.id)).size).toBe(1);
  const stored = matchingDistribution(saved, 'bodies', [saved.bodies[4].id])!;
  expect(stored.id).toBe(s.id);
  const second = applyDistribution(saved, stored, { ...stored.options, count: 5, value: 1200 });
  expect(second.project.bodies.map((b) => b.origin[0])).toEqual([
    12.5, 312.5, 612.5, 912.5, 1212.5,
  ]);
  expect(second.ids).toEqual(first.ids.slice(0, 5));
  const third = applyDistribution(second.project, second.series, {
    ...second.series.options,
    count: 8,
    value: 700,
  });
  expect(third.project.bodies).toHaveLength(8);
  expect(new Set(third.project.bodies.map((b) => b.component?.id)).size).toBe(1);
  expect(third.project.distributions).toHaveLength(1);
  const history = new History(p);
  history.commit(saved);
  history.commit(second.project);
  expect(history.undo().bodies).toEqual(saved.bodies);
  expect(history.redo().distributions).toEqual(second.project.distributions);
});

it('copies a closed assembly with its hierarchy and arranges assemblies without breaking them apart', () => {
  const a = { ...makeBody(18, 50, 100), groupId: 'assembly' },
    b = { ...makeBody(18, 50, 100, [182, 0, 0]), groupId: 'child' };
  const p = {
    ...freshProject(),
    bodies: [a, b],
    groups: [
      { id: 'assembly', name: 'Kaappi', kind: 'assembly' as const, hidden: false },
      { id: 'child', parentId: 'assembly', name: 'Osat', hidden: false },
    ],
  };
  const s = newDistribution(p, 'bodies', [a.id, b.id], 'copy', 'assembly');
  const r = applyDistribution(p, s, { ...s.options, count: 3, measure: 'gap', value: 50 });
  expect(r.project.bodies.map((b) => b.origin[0])).toEqual([0, 182, 250, 432, 500, 682]);
  expect(r.project.groups).toHaveLength(6);
  const arrangement = newDistribution(r.project, 'bodies', r.ids, 'arrange');
  expect(arrangement.members).toHaveLength(3);
  const arranged = applyDistribution(r.project, arrangement, {
    ...arrangement.options,
    value: 1000,
  });
  expect(arranged.project.bodies.map((b) => b.origin[0])).toEqual([0, 182, 400, 582, 800, 982]);
  const reduced = applyDistribution(r.project, r.series, { ...r.series.options, count: 2 });
  expect(parseProject(JSON.stringify(reduced.project)).groups).toHaveLength(4);
});

it('changing a saved copy pattern axis aligns all instances to the original on the other axes', () => {
  const body = makeBody(20, 30, 40, [10, -30, 80]);
  const p = { ...freshProject(), bodies: [body] },
    s = newDistribution(p, 'bodies', [body.id], 'copy');
  const x = applyDistribution(p, s, { ...s.options, count: 4, measure: 'step', value: 100 });
  const z = applyDistribution(x.project, x.series, {
    ...x.series.options,
    axis: 'z',
    reverse: true,
    value: 50,
  });
  expect(z.project.bodies.map((b) => b.origin)).toEqual([
    [10, -30, 80],
    [10, -30, 30],
    [10, -30, -20],
    [10, -30, -70],
  ]);
  expect(z.ids).toEqual(x.ids);
});

const line = (id: string, x: number): Guide => ({
  id,
  mode: 'guide',
  plane: 'XZ',
  angle: 90,
  length: 500,
  direction: [0, 0, 1],
  anchor: { point: [x, 20, -50] },
});
it('divides two boundary guides into N intervals, retains both boundaries and supports later count changes', () => {
  const p = { ...freshProject(), guides: [line('a', 20), line('b', 1020)] };
  const s = newDistribution(p, 'guides', ['b', 'a'], 'copy');
  const r = applyDistribution(p, s, { ...s.options, value: 1000, count: 6 });
  const positions = (project: typeof p) =>
    project.guides.map((g) => guidePoints(project.bodies, g)![0][0]).sort((a, b) => a - b);
  expect(positions(r.project)).toEqual([20, 220, 420, 620, 820, 1020]);
  expect(r.series.members.at(-1)!.ids).toEqual(['b']);
  expect(r.project.guides.find((g) => g.id === 'b')).toEqual(p.guides[1]);
  const next = applyDistribution(r.project, r.series, {
    ...r.series.options,
    count: 3,
    value: 1000,
  });
  expect(positions(next.project)).toEqual([20, 520, 1020]);
  expect(next.project.guides.find((g) => g.id === 'b')).toEqual(p.guides[1]);
  const more = applyDistribution(next.project, next.series, {
    ...next.series.options,
    count: 5,
    value: 800,
  });
  expect(positions(more.project)).toEqual([20, 220, 420, 620, 820]);
  expect(
    guidePoints(
      more.project.bodies,
      more.project.guides.find((g) => g.id === 'b')!,
    )![0][0],
  ).toBe(820);
});

it('distributes free measurement lines at negative coordinates without losing end points or line lengths', () => {
  const g: Guide = { ...line('free', 20), mode: 'free', endAnchor: { point: [20, 20, 450] } };
  const p = { ...freshProject(), guides: [g] },
    s = newDistribution(p, 'guides', ['free'], 'copy');
  const r = applyDistribution(p, s, {
    ...s.options,
    count: 4,
    reverse: true,
    measure: 'step',
    value: 123.5,
  });
  expect(r.project.guides.map((g) => guidePoints([], g))).toEqual(
    [0, 1, 2, 3].map((i) => [
      [20 - 123.5 * i, 20, -50],
      [20 - 123.5 * i, 20, 450],
    ]),
  );
  expect(parseProject(JSON.stringify(r.project)).guides).toHaveLength(4);
});

it('preserves distribution identities on project import and library export, and drops a deleted member’s pattern', () => {
  const b = makeBody(18, 60, 60),
    p = { ...freshProject(), bodies: [b] },
    s = newDistribution(p, 'bodies', [b.id], 'copy');
  const r = applyDistribution(p, s, { ...s.options, count: 3 });
  const merged = mergeProject(r.project, r.project).project;
  expect(merged.distributions).toHaveLength(2);
  expect(new Set(merged.distributions!.flatMap((s) => s.members.flatMap((m) => m.ids))).size).toBe(
    6,
  );
  expect(
    merged.distributions![1].members.every((m) =>
      m.ids.every((id) => merged.bodies.some((b) => b.id === id)),
    ),
  ).toBe(true);
  const exported = selectionProject(r.project, r.ids, 'Sarja');
  expect(exported.distributions).toHaveLength(1);
  expect(
    exported.distributions![0].members.every((m) => exported.bodies.some((b) => b.id === m.ids[0])),
  ).toBe(true);
  expect(selectionProject(r.project, [r.ids[0]], 'Yksi').distributions).toEqual([]);
  expect(removeSelection(r.project, [r.ids[1]]).distributions).toEqual([]);
});

it('validates Hold, space, count, coordinates and parallelism before modifying the model', () => {
  const body = makeBody(48, 60, 100),
    p = { ...freshProject(), bodies: [body] },
    s = newDistribution(p, 'bodies', [body.id], 'copy');
  const snapshot = JSON.stringify(p);
  expect(() => applyDistribution(p, s, { ...s.options, count: 10, value: 479 })).toThrow(
    'eivät mahdu',
  );
  expect(() => applyDistribution(p, s, { ...s.options, count: 1 })).toThrow('määrä');
  expect(() =>
    applyDistribution(p, s, { ...s.options, count: 3, value: 60000, measure: 'step' }),
  ).toThrow('sijaintialueen');
  expect(() => applyDistribution({ ...p, bodies: [{ ...body, locked: true }] }, s)).toThrow('Hold');
  const held = {
    ...p,
    groups: [{ id: 'g', name: 'G', hidden: false, locked: true }],
    bodies: [{ ...body, groupId: 'g' }],
  };
  expect(() => applyDistribution(held, s)).toThrow('Hold');
  expect(planDistribution(p, s, { ...s.options, count: 2, measure: 'gap', value: 0 }).gapMin).toBe(
    0,
  );
  expect(JSON.stringify(p)).toBe(snapshot);
  const guides = {
    ...freshProject(),
    guides: [
      line('a', 20),
      { ...line('b', 200), direction: [0, 1, 0] as [number, number, number] },
    ],
  };
  const gs = newDistribution(guides, 'guides', ['a', 'b'], 'copy');
  expect(() => applyDistribution(guides, gs)).toThrow('samansuuntaiset');
  expect(() => applyDistribution(guides, gs, { ...gs.options, axis: 'z' })).toThrow('poikittainen');
});
