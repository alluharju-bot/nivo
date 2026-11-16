import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { stillFrameTracker } from './stillFrame';
import { evaluateCamera, type CameraTrack } from '../model/cameraAnimation';

it('reuses only an identical camera with an unchanged scene', () => {
  const camera = new PerspectiveCamera(),
    same = stillFrameTracker();
  camera.updateMatrixWorld(true);
  expect(same(camera, false)).toBe(false);
  expect(same(camera, false)).toBe(true);
  expect(same(camera, true)).toBe(false); // Moving object or attached light.
  camera.position.x += 0.000001;
  camera.updateMatrixWorld(true);
  expect(same(camera, false)).toBe(false);
  camera.rotation.y += 0.1;
  camera.updateMatrixWorld(true);
  expect(same(camera, false)).toBe(false);
  camera.setFocalLength(80);
  expect(same(camera, false)).toBe(false);
  expect(same(camera, false)).toBe(true);
});

it('keeps a stop exactly fixed at 30 fps but does not freeze its zoom', () => {
  const track: CameraTrack = {
    keys: [
      {
        id: 'a',
        name: 'A',
        time: 0,
        hold: 1.5,
        position: [12.3, -4000.7, 1530.2],
        target: [2000.3, 1234.5, 2010.1],
        focalLength: 29,
        interpolation: 'smooth',
      },
    ],
  };
  const first = evaluateCamera(track, 0)!;
  for (let i = 1; i <= 45; i++) expect(evaluateCamera(track, i / 30)).toEqual(first);
  track.keys[0].zoom = { target: [2500, 800, 1900], focalLength: 70 };
  expect(evaluateCamera(track, 0.5)).not.toEqual(evaluateCamera(track, 0.6));
});
