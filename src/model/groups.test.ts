import { describe, it, expect } from 'vitest';
import { freshProject, makeBody, parseProject, type Project } from './project';
import { bodyVisible, moveToOrigin } from './transforms';
import {
  bodyLocked,
  groupBodies,
  reparentGroup,
  dissolveGroup,
  translateSelection,
  moveInTree,
} from './groups';
import { resolveAnchor } from './guides';

function frame(): Project {
  const parts = Array.from({ length: 15 }, (_, i) => ({
    ...makeBody(40, 100, 600, [i * 60, 0, 0], `Puu ${i + 1}`),
    groupId: i < 5 ? 'root' : 'child',
  }));
  return {
    ...freshProject(),
    bodies: [...parts, makeBody(50, 50, 50, [1200, 0, 0], 'Muu')],
    groups: [
      { id: 'root', name: 'Runko', hidden: false },
      { id: 'child', parentId: 'root', name: 'Pystyt', hidden: false },
    ],
    dimensions: [{ id: 'dim', bodyId: parts[0].id, axis: 'z', from: 'min', to: 'max' }],
    guides: [
      {
        id: 'guide',
        anchor: { bodyId: parts[0].id, key: 'corner:0', local: [0, 0, 0] },
        plane: 'XY',
        angle: 0,
        length: 100,
        mode: 'guide',
      },
    ],
  };
}

describe('nested groups and whole-selection transforms', () => {
  it('inherits visibility and Hold without erasing individual flags', () => {
    const p = frame();
    p.groups[0].hidden = true;
    p.groups[0].locked = true;
    p.bodies[4].locked = true;
    expect(groupBodies(p, 'root')).toHaveLength(15);
    expect(groupBodies(p, 'child')).toHaveLength(10);
    expect(bodyVisible(p.bodies[14], p.groups)).toBe(false);
    expect(bodyLocked(p.bodies[14], p.groups)).toBe(true);
    expect(() => translateSelection(p, [p.bodies[14].id], [1, 0, 0])).toThrow('kiinnitetty');
    expect(() => moveToOrigin(p, [p.bodies[14].id], 'min')).toThrow();
    p.groups[0].hidden = false;
    p.groups[0].locked = false;
    expect(bodyLocked(p.bodies[14], p.groups)).toBe(false);
    expect(bodyLocked(p.bodies[4], p.groups)).toBe(true);
    expect(bodyVisible(p.bodies[14], p.groups)).toBe(true);
  });
  it('rejects cycles and missing parents at both the action and file boundary', () => {
    const p = frame();
    expect(() => reparentGroup(p, 'root', 'child')).toThrow();
    expect(() => reparentGroup(p, 'child', 'child')).toThrow();
    expect(() => reparentGroup(p, 'child', 'missing')).toThrow();
    for (const parentId of ['child', 'missing']) {
      expect(() =>
        parseProject(JSON.stringify({ ...p, groups: [{ ...p.groups[0], parentId }, p.groups[1]] })),
      ).toThrow();
    }
    expect(reparentGroup(p, 'child').groups[1].parentId).toBeUndefined();
  });
  it('dissolves only the selected group, keeping children and parts at its parent level', () => {
    const p = frame(),
      result = dissolveGroup(p, 'root');
    expect(result.groups).toEqual([{ ...p.groups[1], parentId: undefined }]);
    expect(result.bodies).toHaveLength(16);
    expect(result.bodies[0].groupId).toBeUndefined();
    expect(result.bodies[14].groupId).toBe('child');
    expect(parseProject(JSON.stringify(result)).bodies).toHaveLength(16);
  });
  it('moves all fifteen parts by the same vector and leaves unrelated geometry untouched', () => {
    const p = frame(),
      ids = groupBodies(p, 'root').map((b) => b.id);
    const result = translateSelection(p, ids, [1000, -20, 40]).project;
    result.bodies
      .slice(0, 15)
      .forEach((b, i) => expect(b.origin).toEqual([i * 60 + 1000, -20, 40]));
    expect(result.bodies[15]).toEqual(p.bodies[15]);
    expect(p.bodies[0].origin).toEqual([0, 0, 0]);
  });
  it('copies the group tree and remaps dimensions and anchored guides to independent parts', () => {
    const p = frame(),
      ids = groupBodies(p, 'root').map((b) => b.id);
    const {
      project: result,
      ids: copied,
      groupId,
    } = translateSelection(p, ids, [1000, 0, 0], true, 'root');
    expect(result.bodies).toHaveLength(31);
    expect(result.bodies.slice(0, 16)).toEqual(p.bodies);
    expect(groupBodies(result, groupId!)).toHaveLength(15);
    expect(result.groups[3].parentId).toBe(groupId);
    expect('bodyId' in result.dimensions[1] ? result.dimensions[1].bodyId : undefined).toBe(
      copied[0],
    );
    expect(resolveAnchor(result.bodies, result.guides[1].anchor)).toEqual([1000, 0, 0]);
    expect(parseProject(JSON.stringify(result)).groups).toHaveLength(4);
    expect(new Set(result.bodies.map((b) => b.id)).size).toBe(31);
  });
  it('supports a reduced group selection plus an unrelated added part', () => {
    const p = frame(),
      ids = [
        ...groupBodies(p, 'root')
          .slice(1)
          .map((b) => b.id),
        p.bodies[15].id,
      ];
    const result = translateSelection(p, ids, [10, 20, 30], true, 'root');
    expect(result.ids).toHaveLength(15);
    expect(groupBodies(result.project, result.groupId!)).toHaveLength(14);
    expect(result.project.bodies.at(-1)!.name).toBe('Muu kopio');
    expect(result.project.dimensions).toEqual(p.dimensions);
    expect(result.project.guides).toEqual(p.guides);
  });
});

describe('tree rearrangement', () => {
  it('moves a selection across hierarchy without moving geometry, changing IDs or losing references', () => {
    const p = frame();
    const ids = [p.bodies[0].id, p.bodies[15].id];
    const next = moveInTree(p, { kind: 'bodies', ids }, 'child');
    expect(next.groups).toEqual(p.groups);
    expect(next.dimensions).toEqual(p.dimensions);
    expect(next.guides).toEqual(p.guides);
    next.bodies.forEach((b, i) =>
      expect(b).toEqual(ids.includes(b.id) ? { ...p.bodies[i], groupId: 'child' } : p.bodies[i]),
    );
    const root = moveInTree(next, { kind: 'bodies', ids });
    expect(root.bodies.filter((b) => ids.includes(b.id)).every((b) => !b.groupId)).toBe(true);
    expect(p.bodies[0].groupId).toBe('root');
  });
  it('rejects missing entries and cycles, and preserves project identity on a no-op', () => {
    const p = frame();
    expect(moveInTree(p, { kind: 'bodies', ids: [p.bodies[0].id] }, 'root')).toBe(p);
    expect(moveInTree(p, { kind: 'group', id: 'root' })).toBe(p);
    expect(() => moveInTree(p, { kind: 'bodies', ids: ['missing'] }, 'root')).toThrow();
    expect(() => moveInTree(p, { kind: 'bodies', ids: [] })).toThrow();
    expect(() => moveInTree(p, { kind: 'group', id: 'root' }, 'child')).toThrow();
    expect(() => moveInTree(p, { kind: 'group', id: 'root' }, 'root')).toThrow();
    expect(() => moveInTree(p, { kind: 'group', id: 'missing' })).toThrow();
    expect(() => moveInTree(p, { kind: 'bodies', ids: [p.bodies[0].id] }, 'missing')).toThrow();
    const next = moveInTree(p, { kind: 'group', id: 'child' });
    expect(next.bodies).toEqual(p.bodies);
    expect(next.groups[1].parentId).toBeUndefined();
  });
});
