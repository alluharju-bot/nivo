import { describe, it, expect } from 'vitest';
import { freshProject, makeBody } from './project';
import { assemblyParts, explodeParts, partsCSV, partRows } from './parts';
import { drawingProject, pickDrawingPoint } from '../drawing/selection';
import type { BodyMesh } from '../cad/protocol';

describe('assembly documentation', () => {
  it('includes hidden physical parts and nested groups, excludes construction and flat sketches', () => {
    const project = freshProject();
    project.groups = [
      { id: 'a', name: 'Kaappi', hidden: false, locked: false },
      { id: 'b', name: 'Ovet', parentId: 'a', hidden: false, locked: false },
    ];
    project.bodies = [
      { ...makeBody(600, 18, 700), groupId: 'b', hidden: true },
      { ...makeBody(100, 100, 10), purpose: 'construction' },
      makeBody(10, 10, 0),
      makeBody(20, 20, 20),
    ];
    expect(assemblyParts(project, 'a')).toHaveLength(1);
    expect(assemblyParts(project)).toHaveLength(2);
    expect(partRows(project, assemblyParts(project, 'a'))[0].group).toBe('Kaappi / Ovet');
    expect(drawingProject(project, 'all', []).bodies).not.toContainEqual(project.bodies[0]);
    expect(drawingProject(project, 'group:a', []).bodies).toContainEqual(project.bodies[0]);
  });
  it('explodes only presentation copies and returns exactly to assembly at zero', () => {
    const bodies = [makeBody(18, 600, 2400, [0, 0, 0]), makeBody(18, 600, 2400, [582, 0, 0])];
    const original = structuredClone(bodies);
    const result = explodeParts(bodies, [], 1);
    expect(result.bodies[0].origin[0]).toBeLessThan(0);
    expect(result.bodies[1].origin[0]).toBeGreaterThan(582);
    expect(explodeParts(bodies, [], 0).bodies).toEqual(original);
    expect(bodies).toEqual(original);
  });
  it('exports millimetres and escapes spreadsheet formulas, delimiters and quotes', () => {
    const project = freshProject();
    project.bodies = [makeBody(600, 18, 2400, [0, 0, 0], '=1+1;"ovi"')];
    const csv = partsCSV(project, project.bodies);
    expect(csv).toContain('"\'=1+1;""ovi"""');
    expect(csv).toContain('"600";"18";"2400"');
  });
  it('snaps drawing points to CAD corners then midpoints and exact edges', () => {
    const from = { bodyId: 'a', key: 'corner:0', local: [0, 0, 0] as [number, number, number] },
      to = { bodyId: 'a', key: 'corner:4', local: [100, 0, 0] as [number, number, number] };
    const meshes = [
      {
        verticesCAD: [
          { point: [0, 0, 0], anchor: from },
          { point: [100, 0, 0], anchor: to },
        ],
        edgesCAD: [{ start: [0, 0, 0], end: [100, 0, 0], from, to }],
      },
    ] as unknown as BodyMesh[];
    expect(pickDrawingPoint(meshes, 'front', [1, 0], 3)?.label).toBe('Kulmapiste');
    expect(pickDrawingPoint(meshes, 'front', [49, 1], 3)?.label).toBe('Keskipiste');
    expect(pickDrawingPoint(meshes, 'front', [25, 1], 3)?.point).toEqual([25, 0, 0]);
    expect(pickDrawingPoint(meshes, 'front', [25, 10], 3)).toBeUndefined();
  });
});
