import { expect, it, vi } from 'vitest';
import { LineSegments, Scene } from 'three';
import type { BodyMesh, CadFace, FaceTarget } from '../cad/protocol';
import { extrusionPreview } from './extrusionPreview';

it('retains face and edge buffers while dragging and releases them on topology changes or cancellation', () => {
  const face: CadFace = {
    start: 0,
    count: 6,
    ref: 'z:max',
    index: 0,
    normal: [0, 0, 1],
    center: [5, 5, 0],
    planar: true,
  };
  const data: BodyMesh = {
    id: 'part',
    vertices: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
    normals: [],
    triangles: [0, 1, 2, 0, 2, 3],
    edges: [],
    faces: [face],
    volume: 0,
    verticesCAD: [],
    midpointsCAD: [],
    edgesCAD: [],
    boundaries: [],
  };
  const target: FaceTarget = { bodyId: 'part', face: 'z:max', point: [5, 5, 0], normal: [0, 0, 1] };
  const scene = new Scene(),
    preview = extrusionPreview(scene);
  preview.update(data, face, target, 5, true);
  const surface = preview.surfaces()[0];
  const group = scene.children[0];
  const links = group.children[2] as LineSegments;
  const position = links.geometry.getAttribute('position');
  const dispose = vi.spyOn(surface.geometry, 'dispose');
  for (let i = 0; i < 20; i++) preview.update(data, face, target, -i, true);
  expect(preview.surfaces()[0]).toBe(surface);
  expect(links.geometry.getAttribute('position')).toBe(position);
  expect(surface.position.z).toBe(-19);
  expect(position.getZ(0)).toBe(0);
  expect(position.getZ(1)).toBe(-19);
  expect(dispose).not.toHaveBeenCalled();
  preview.update(data, face, target, 0, false);
  expect(surface.visible).toBe(false);
  preview.update({ ...data, vertices: data.vertices.map((n) => n * 2) }, face, target, 10, true);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(preview.surfaces()[0]).not.toBe(surface);
  preview.clear();
  expect(preview.surfaces()).toEqual([]);
  expect(group.children).toEqual([]);
  preview.dispose();
  expect(scene.children).toEqual([]);
});
