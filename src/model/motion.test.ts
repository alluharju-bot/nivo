import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { freshProject, makeBody, parseProject, projectSchema, type Vec3 } from './project';
import {
  motionError,
  motionTransforms,
  motionWorld,
  pruneMotions,
  setMotionWorld,
  type Motion,
} from './motion';
import { mergeProject, selectionProject } from './projectImport';
import { removeSelection } from './selection';
import { History } from './history';
import { translateSelection } from './groups';
import { applyScaling } from './scaling';

const anchor = makeBody(600, 500, 800, [100, 200, 0], 'Runko');
const drawers = Array.from({ length: 6 }, (_, i) =>
  makeBody(550, 400, 100, [120, 180, i * 120], `Laatikko ${i + 1}`),
);
const bodies = [anchor, ...drawers];
const makeMotion = (i = 0): Motion => ({
  id: `pivot-${i}`,
  name: `Laatikko ${i + 1}`,
  kind: 'slide',
  anchorId: anchor.id,
  movingIds: [drawers[i].id],
  pivot: [0, 0, 0],
  axis: [0, -1, 0],
  amount: 300,
  duration: 1,
  easing: 'smooth',
});
const point = (p: Vec3, matrix?: import('three').Matrix4) =>
  matrix ? new Vector3(...p).applyMatrix4(matrix).toArray() : p;

describe('named pivots and independent reversible poses', () => {
  it('scales the pivot and travel with a whole mechanism, retaining the rigid slide direction', () => {
    const m = setMotionWorld(makeMotion(), anchor, [140, 220, 80], [0, -1, 0]);
    const project = { ...freshProject(), bodies, motions: [m] };
    const scaled = bodies.map((b) => ({ ...b, origin: b.origin.map((n) => n * 2) as Vec3 }));
    const result = applyScaling(project, scaled, {
      ids: bodies.map((b) => b.id),
      pivot: [0, 0, 0],
      factors: [2, 2, 2],
      mode: 'uniform',
    });
    expect(motionWorld(result.motions![0], result.bodies[0]).pivot).toEqual([280, 440, 160]);
    expect(result.motions![0].amount).toBe(600);
    expect(result.motions![0].axis).toEqual([0, -1, 0]);
  });
  it('opens six drawers independently, with no changes to source geometry or linked definitions', () => {
    const motions = drawers.map((_, i) => makeMotion(i)),
      before = JSON.stringify(bodies);
    const transforms = motionTransforms(motions, bodies, { 'pivot-0': 1, 'pivot-3': 0.5 });
    expect(transforms.has(anchor.id)).toBe(false);
    expect(point(drawers[0].origin, transforms.get(drawers[0].id))).toEqual([120, -120, 0]);
    expect(point(drawers[3].origin, transforms.get(drawers[3].id))).toEqual([120, 30, 360]);
    expect(point(drawers[1].origin, transforms.get(drawers[1].id))).toEqual(drawers[1].origin);
    const closed = motionTransforms(motions, bodies, {});
    drawers.forEach((b) => expect(point(b.origin, closed.get(b.id))).toEqual(b.origin));
    expect(JSON.stringify(bodies)).toBe(before);
  });
  it('rotates all moving parts around a picked pivot including negative angles', () => {
    const m = setMotionWorld(
      {
        ...makeMotion(),
        kind: 'hinge',
        amount: -90,
        movingIds: drawers.slice(0, 2).map((b) => b.id),
      },
      anchor,
      [120, 180, 0],
      [0, 0, 1],
    );
    const transforms = motionTransforms([m], bodies, { [m.id]: 1 });
    for (const body of drawers.slice(0, 2)) {
      const rotated = point([220, 180, body.origin[2]], transforms.get(body.id));
      expect(rotated[0]).toBeCloseTo(120);
      expect(rotated[1]).toBeCloseTo(80);
      expect(rotated[2]).toBe(body.origin[2]);
    }
  });
  it('keeps pivot and axis attached when the anchor translates or rotates', () => {
    const m = setMotionWorld(makeMotion(), anchor, [140, 220, 80], [0, -1, 0]);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    const rotated = {
      ...anchor,
      origin: [1000, 2000, 0] as Vec3,
      textureFrame: {
        offset: [0, 0, 0] as Vec3,
        rotation: q.toArray() as [number, number, number, number],
      },
    };
    const world = motionWorld(m, rotated);
    expect(world.pivot[0]).toBeCloseTo(980);
    expect(world.pivot[1]).toBeCloseTo(2040);
    expect(world.pivot[2]).toBe(80);
    expect(world.axis[0]).toBeCloseTo(1);
    expect(world.axis[1]).toBeCloseTo(0);
  });
  it('composes child pivots, independent of definition order', () => {
    const parent = { ...makeMotion(), kind: 'hinge' as const, axis: [0, 0, 1] as Vec3, amount: 90 };
    const child = setMotionWorld(
      { ...makeMotion(1), anchorId: drawers[0].id },
      drawers[0],
      [120, 180, 0],
      [1, 0, 0],
    );
    const transforms = motionTransforms([child, parent], bodies, { [parent.id]: 1, [child.id]: 1 });
    const result = point([120, 180, 0], transforms.get(drawers[1].id));
    expect(result[0]).toBeCloseTo(120);
    expect(result[1]).toBeCloseTo(520);
  });
  it('rejects cycles, duplicate drivers, missing parts, bad directions and excessive angles', () => {
    const first = makeMotion(),
      second = { ...makeMotion(1), movingIds: [drawers[0].id] };
    expect(motionError([first, second], bodies)).toMatch(/toiseen liikkeeseen/);
    expect(
      motionError(
        [first, { ...makeMotion(1), anchorId: drawers[0].id, movingIds: [anchor.id] }],
        bodies,
      ),
    ).toMatch(/kiertävää/);
    expect(motionError([first], [anchor])).toMatch(/puuttuu/);
    for (const bad of [
      { axis: [0, 0, 0] },
      { kind: 'hinge', amount: 400 },
      { movingIds: [anchor.id] },
    ])
      expect(
        projectSchema.safeParse({ ...freshProject(), bodies, motions: [{ ...first, ...bad }] })
          .success,
      ).toBe(false);
  });
  it('persists definitions, not playback, and supports undo and redo', () => {
    const project = { ...freshProject(), bodies },
      next = { ...project, motions: [makeMotion()] };
    const history = new History(project);
    history.commit(next);
    expect(parseProject(JSON.stringify(next)).motions).toEqual(next.motions);
    expect(history.undo()?.motions).toBeUndefined();
    expect(history.redo()?.motions).toEqual(next.motions);
  });
  it('removes dangling definitions on deletion and retains surviving moving parts', () => {
    const m = { ...makeMotion(), movingIds: drawers.slice(0, 2).map((b) => b.id) };
    const project = { ...freshProject(), bodies, motions: [m] };
    expect(removeSelection(project, [anchor.id]).motions).toEqual([]);
    expect(removeSelection(project, [drawers[0].id]).motions?.[0].movingIds).toEqual([
      drawers[1].id,
    ]);
    expect(pruneMotions([m], [anchor])).toEqual([]);
  });
  it('reidentifies imported or library mechanisms, including all member references', () => {
    const project = { ...freshProject(), bodies, motions: [makeMotion()] };
    const merged = mergeProject(project, project).project;
    expect(merged.motions).toHaveLength(2);
    expect(merged.motions![1].id).not.toBe(merged.motions![0].id);
    expect(motionError(merged.motions!, merged.bodies)).toBeUndefined();
    expect(merged.motions![1].movingIds[0]).not.toBe(drawers[0].id);
    expect(selectionProject(project, [anchor.id, drawers[0].id], 'Kaappi').motions).toHaveLength(1);
    expect(selectionProject(project, [drawers[0].id], 'Irrallinen ovi').motions).toHaveLength(0);
  });
  it('copies a complete mechanism with independent pivot IDs', () => {
    const project = { ...freshProject(), bodies, motions: [makeMotion()] };
    const copied = translateSelection(
      project,
      [anchor.id, drawers[0].id],
      [1000, 0, 0],
      true,
    ).project;
    expect(copied.motions).toHaveLength(2);
    expect(motionError(copied.motions!, copied.bodies)).toBeUndefined();
    const m = copied.motions![1],
      b = copied.bodies.find((b) => b.id === m.anchorId)!;
    expect(motionWorld(m, b).pivot).toEqual([1100, 200, 0]);
  });
});
