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
});
