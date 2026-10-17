import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { makeVertex, measureDistanceBetween, measureArea, setOC } from 'replicad';
import { Ray, Triangle, Vector3 } from 'three';
import { makeBody, makeProfileBody, type Body, type Vec3 } from '../model/project';
import { sketchFrame } from '../model/sketch';
import {
  createShape,
  meshBody,
  pushPullFace,
  shapeIsValid,
  solidFaceIds,
  solidVolume,
} from './kernel';
import { shapeFaces } from './topology';
import { penPath, splitWithPath } from './paths';
import { splitFace } from './operations';
import { CadBuildCache } from './buildCache';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

function inspect(body: Body) {
  const shape = createShape(body),
    faces = shapeFaces(shape);
  try {
    expect(shapeIsValid(shape)).toBe(true);
    const mesh = meshBody(body, shape),
      solidFaces = solidFaceIds(shape);
    // Every displayed triangle must belong to the real current CAD region.
    for (const face of mesh.faces) {
      let area = 0;
      const triangle = new Triangle();
      for (let i = face.start; i < face.start + face.count; i += 3) {
        triangle.a.fromArray(mesh.vertices, mesh.triangles[i] * 3);
        triangle.b.fromArray(mesh.vertices, mesh.triangles[i + 1] * 3);
        triangle.c.fromArray(mesh.vertices, mesh.triangles[i + 2] * 3);
        area += triangle.getArea();
      }
      expect(area).toBeCloseTo(measureArea(faces[face.index]), 3);
    }
    return {
      mesh,
      volume: solidVolume(shape),
      loose: faces.filter((f) => !solidFaces.has(f.hashCode)).length,
    };
  } finally {
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}

function faceAt(body: Body, point: Vec3) {
  const shape = createShape(body),
    faces = shapeFaces(shape),
    vertex = makeVertex(point);
  try {
    const face = meshBody(body, shape).faces.find(
      (f) => f.normal[2] > 0.99 && measureDistanceBetween(faces[f.index], vertex) < 1e-5,
    );
    expect(face, `Surface at ${point.join(',')}`).toBeDefined();
    return face!.ref;
  } finally {
    vertex.delete();
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}

function visibleHeight(body: Body, x: number, y: number) {
  const { mesh } = inspect(body),
    ray = new Ray(new Vector3(x, y, 1000), new Vector3(0, 0, -1));
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    point = new Vector3();
  const heights: number[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    a.fromArray(mesh.vertices, mesh.triangles[i] * 3);
    b.fromArray(mesh.vertices, mesh.triangles[i + 1] * 3);
    c.fromArray(mesh.vertices, mesh.triangles[i + 2] * 3);
    if (ray.intersectTriangle(a, b, c, false, point)) heights.push(point.z);
  }
  return Math.max(...heights);
}

it.each([-10, 10])('keeps every other pen division after a %i mm push/pull', (distance) => {
  let body = makeBody(300, 200, 40);
  for (const x of [100, 200])
    body = splitWithPath(
      body,
      faceAt(body, [x, 100, 40]),
      penPath(
        [
          [x, 0, 40],
          [x, 200, 40],
        ],
        'Jako',
      ),
    ).body;
  expect(inspect(body).mesh.faces.filter((f) => f.normal[2] > 0.99)).toHaveLength(3);
  body = pushPullFace(body, faceAt(body, [50, 100, 40]), distance);
  expect(inspect(body).loose).toBe(0);
  expect(faceAt(body, [150, 100, 40])).not.toBe(faceAt(body, [250, 100, 40]));
  body = pushPullFace(body, faceAt(body, [150, 100, 40]), -20);
  expect(inspect(body).volume).toBeCloseTo(300 * 200 * 40 + 100 * 200 * (distance - 20), 3);
  expect(visibleHeight(body, 50, 100)).toBeCloseTo(40 + distance, 5);
  expect(visibleHeight(body, 150, 100)).toBeCloseTo(20, 5);
  expect(visibleHeight(body, 250, 100)).toBeCloseTo(40, 5);
});

it('never covers existing recesses when the surrounding face is raised', () => {
  let body = makeBody(300, 200, 40);
  for (const x of [20, 100]) {
    const split = splitFace(
      body,
      faceAt(body, [x + 20, 50, 40]),
      makeProfileBody({ kind: 'rectangle', width: 40, depth: 60 }, sketchFrame([x, 20, 40])),
    );
    body = pushPullFace(split.body, split.face, -10);
  }
  body = pushPullFace(body, faceAt(body, [220, 100, 40]), 5);
  expect(inspect(body).loose).toBe(0);
  expect(inspect(body).volume).toBeCloseTo(
    300 * 200 * 40 - 2 * 40 * 60 * 10 + (300 * 200 - 2 * 40 * 60) * 5,
    3,
  );
  expect(visibleHeight(body, 40, 50)).toBeCloseTo(30, 5);
  expect(visibleHeight(body, 120, 50)).toBeCloseTo(30, 5);
  expect(visibleHeight(body, 220, 100)).toBeCloseTo(45, 5);
});

it('preserves curved partitions and cached history through successive pocket edits', () => {
  const cache = new CadBuildCache();
  let body = makeBody(300, 200, 40);
  try {
    for (const x of [60, 160]) {
      body = splitFace(
        body,
        faceAt(body, [x, 100, 40]),
        makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([x, 100, 40])),
      ).body;
    }
    const initial = body;
    const [entry] = cache.build([initial]);
    const initialVertices = [...entry.mesh.vertices];
    body = pushPullFace(body, faceAt(body, [60, 100, 40]), -10, cache);
    cache.build([body]);
    expect(faceAt(body, [160, 100, 40])).not.toBe(faceAt(body, [260, 100, 40]));
    body = pushPullFace(body, faceAt(body, [160, 100, 40]), -20, cache);
    cache.build([body]);
    body = pushPullFace(body, faceAt(body, [260, 100, 40]), 5, cache);
    const [final] = cache.build([body]);
    const restored = createShape(body);
    try {
      expect(shapeIsValid(final.shape)).toBe(true);
      expect(solidVolume(final.shape)).toBeCloseTo(
        300 * 200 * 45 - Math.PI * 20 ** 2 * (15 + 25),
        3,
      );
      expect(solidVolume(restored)).toBeCloseTo(solidVolume(final.shape), 4);
      const storedMesh = meshBody(body, restored);
      // The faces addressed by the UI must have the same ownership after a reload.
      expect(storedMesh.faces.map((f) => [f.ref, f.index, f.center])).toEqual(
        final.mesh.faces.map((f) => [f.ref, f.index, f.center]),
      );
      expect(faceAt(body, [60, 100, 30])).not.toBe(faceAt(body, [160, 100, 20]));
    } finally {
      restored.delete();
    }
    const [undo] = cache.build([initial]);
    expect(undo.mesh.vertices).toEqual(initialVertices);
    expect(solidVolume(undo.shape)).toBeCloseTo(300 * 200 * 40, 4);
    const [redo] = cache.build([body]);
    expect(redo.mesh).toEqual(final.mesh);
  } finally {
    cache.dispose();
  }
});
