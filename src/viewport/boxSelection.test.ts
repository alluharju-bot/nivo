import { describe, it, expect } from 'vitest';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { projectSelectionBounds, insideSelectionRect } from './boxSelection';
import type { BodyMesh } from '../cad/protocol';
const meshes = [
  { id: 'a', vertices: [-1, -1, 0, 1, 1, 0] },
  { id: 'b', vertices: [2, 2, 0, 3, 3, 0] },
] as BodyMesh[];
describe('rectangle selection', () => {
  it('contains entire projected objects in either drag direction', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    const projected = projectSelectionBounds(meshes, camera, 100, 100);
    expect(insideSelectionRect(projected, 39, 39, 61, 61)).toEqual(['a']);
    expect(insideSelectionRect(projected, 61, 61, 39, 39)).toEqual(['a']);
    expect(insideSelectionRect(projected, 50, 50, 61, 61)).toEqual([]);
    expect(insideSelectionRect(projected, 0, 0, 100, 100)).toEqual(['a', 'b']);
  });
  it('excludes perspective objects behind the camera', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    expect(
      projectSelectionBounds(
        [...meshes, { id: 'behind', vertices: [-1, -1, 20, 1, 1, 20] } as BodyMesh],
        camera,
        100,
        100,
      ).map((b) => b.id),
    ).toEqual(['a', 'b']);
  });
  it('crossing selects intersecting faces and lines but not empty corners of a projected triangle', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    const parts = [
      { id: 'triangle', vertices: [-2, -2, 0, 2, -2, 0, -2, 2, 0], triangles: [0, 1, 2] },
    ] as BodyMesh[];
    const projected = projectSelectionBounds(parts, camera, 100, 100);
    expect(insideSelectionRect(projected, 38, 38, 32, 32, true)).toEqual(['triangle']);
    expect(insideSelectionRect(projected, 68, 38, 62, 32, true)).toEqual([]);
    expect(insideSelectionRect(projected, 32, 32, 38, 38)).toEqual([]);
    // A crossing window entirely inside a face still intersects it.
    expect(insideSelectionRect(projected, 38, 58, 32, 52, true)).toEqual(['triangle']);
  });
  it('crossing accepts the visible part at the camera near plane; containment does not', () => {
    const camera = new PerspectiveCamera(60, 1, 1, 100);
    const part = {
      id: 'near',
      vertices: [-1, -1, -3, 1, -1, -3, 0, 1, 1],
      triangles: [0, 1, 2],
    } as BodyMesh;
    const projected = projectSelectionBounds([part], camera, 100, 100);
    expect(insideSelectionRect(projected, 100, 100, 0, 0, true)).toEqual(['near']);
    expect(insideSelectionRect(projected, 0, 0, 100, 100)).toEqual([]);
  });
  it('selects an open wire by its segments without filling the space between them', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    const wire = {
      id: 'wire',
      vertices: [],
      triangles: [],
      edges: [-2, -2, 0, 2, -2, 0, 2, -2, 0, 2, 2, 0],
    } as unknown as BodyMesh;
    const projected = projectSelectionBounds([wire], camera, 100, 100);
    expect(insideSelectionRect(projected, 0, 0, 100, 100)).toEqual(['wire']);
    expect(insideSelectionRect(projected, 75, 55, 65, 45, true)).toEqual(['wire']);
    expect(insideSelectionRect(projected, 55, 55, 45, 45, true)).toEqual([]);
  });
  it('selects only the displayed portion of a section and excludes fully clipped parts', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.z = 10;
    camera.lookAt(0, 0, 0);
    const cutMeshes = [
      {
        id: 'crossing',
        vertices: [-2, -1, 0, 2, -1, 0, 2, 1, 0, -2, 1, 0],
        triangles: [0, 1, 2, 0, 2, 3],
      },
      { id: 'removed', vertices: [2, 2, 0, 3, 3, 0], triangles: [] },
    ] as unknown as BodyMesh[];
    const projected = projectSelectionBounds(cutMeshes, camera, 100, 100, (p) => p[0]);
    expect(projected).toHaveLength(1);
    expect(projected[0].right).toBeCloseTo(50, 5);
    expect(insideSelectionRect(projected, 29, 39, 51, 61)).toEqual(['crossing']);
  });
});
