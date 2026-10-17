import { expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { Vec3 } from '../model/project';
import type { CadEdge } from '../cad/protocol';
import { edgeIntersectionPoints } from './edgeIntersections';

const reference = (key: string, start: Vec3, end: Vec3) => ({
  key,
  edge: {
    start,
    end,
    from: { bodyId: key, key: 'a', local: start },
    to: { bodyId: key, key: 'b', local: end },
  } as CadEdge,
});

it.each([false, true])(
  'acquires crossings in a small cursor disk in perspective=%s and updates after edits',
  (perspective) => {
    const camera = perspective
      ? new PerspectiveCamera(50, 1, 0.1, 1000)
      : new OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(50, -100, 200);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const a = reference('part:edge:0', [-80, -60, 0], [80, 60, 0]);
    const b = reference('line:edge:0', [-80, 30, 0], [80, 30, 0]);
    const projected = new Vector3(40, 30, 0).project(camera),
      x = (projected.x + 1) * 400,
      y = (1 - projected.y) * 400;
    const pick = (edges: (typeof a)[]) =>
      edgeIntersectionPoints(edges, camera, 800, 800, x + 1, y - 1, 20);
    const result = pick([a, b]);
    expect(result).toHaveLength(2); // Either participating part can own the anchor.
    result.forEach((p) => p.point.forEach((n, k) => expect(n).toBeCloseTo([40, 30, 0][k], 7)));
    expect(pick([a, b])).toEqual(result);
    expect(pick([a, reference('line:edge:0', [-80, 30, 5], [80, 30, 5])])).toEqual([]);
    expect(edgeIntersectionPoints([a, b], camera, 800, 800, 0, 0, 20)).toEqual([]);
  },
);
