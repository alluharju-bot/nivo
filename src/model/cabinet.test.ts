import { describe, expect, it } from 'vitest';
import { cabinetDefaults, cabinetPlan, insertCabinet } from './cabinet';
import { freshProject, makeBody, projectSchema } from './project';
import { History } from './history';

describe('cabinet panels', () => {
  it.each(['sides-full', 'caps-full'] as const)(
    'keeps panels separate with %s joints',
    (joints) => {
      const plan = cabinetPlan({ ...cabinetDefaults, joints, shelves: 3, doors: 'double' });
      expect(plan).toHaveLength(10);
      // Every pair may touch, but no two boards may overlap in volume.
      for (let i = 0; i < plan.length; i++)
        for (let j = i + 1; j < plan.length; j++) {
          const a = plan[i],
            b = plan[j];
          const overlap = a.origin.map(
            (v, k) => Math.min(v + a.size[k], b.origin[k] + b.size[k]) - Math.max(v, b.origin[k]),
          );
          expect(Math.min(...overlap)).toBeLessThanOrEqual(1e-8);
        }
      expect(plan.find((p) => p.key === 'left')?.size[2]).toBe(joints === 'sides-full' ? 720 : 684);
      expect(plan.find((p) => p.key === 'top')?.size[0]).toBe(joints === 'sides-full' ? 564 : 600);
      const shelves = plan.filter((p) => p.role === 'shelf');
      expect(shelves[0].size).toEqual([564, 562, 18]);
      expect(shelves[1].origin[2] - shelves[0].origin[2]).toBeCloseTo(175.5);
    },
  );
  it('keeps overlay back within the requested depth and places doors ahead of the carcass', () => {
    const panels = cabinetPlan({
      ...cabinetDefaults,
      back: 'overlay',
      doors: 'single',
      origin: [100, 200, 300],
    });
    expect(panels.find((p) => p.key === 'left')?.size[1]).toBe(594);
    expect(panels.find((p) => p.key === 'back')).toMatchObject({
      size: [600, 6, 720],
      origin: [100, 794, 300],
    });
    expect(panels.find((p) => p.key === 'door-0')).toMatchObject({
      size: [596, 18, 716],
      origin: [102, 182, 302],
    });
  });
  it('rejects impossible thickness, shelves, inset and coordinates', () => {
    for (const patch of [
      { width: 36 },
      { depth: 16 },
      { shelves: 1.5 },
      { shelves: 20, height: 200 },
      { origin: [100_000, 0, 0] as [number, number, number] },
      { shelfInset: 700 },
    ])
      expect(() => cabinetPlan({ ...cabinetDefaults, ...patch })).toThrow();
  });
  it('creates a named component group in one undo step and preserves the source until requested', () => {
    const initial = freshProject(),
      source = makeBody(600, 600, 720);
    initial.bodies = [source];
    const history = new History(initial);
    const added = insertCabinet(initial, cabinetDefaults);
    expect(projectSchema.safeParse(added.project).success).toBe(true);
    expect(added.project.bodies[0]).toEqual(source);
    expect(
      added.bodies.every((b) => b.purpose === 'component' && b.groupId === added.group.id),
    ).toBe(true);
    const replaced = insertCabinet(initial, cabinetDefaults, source.id);
    expect(replaced.project.bodies).toHaveLength(6);
    expect(replaced.project.bodies.some((b) => b.id === source.id)).toBe(false);
    history.commit(replaced.project);
    history.undo();
    expect(history.current).toEqual(initial);
  });
});
