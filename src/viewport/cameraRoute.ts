import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { evaluateCamera, type CameraTrack } from '../model/cameraAnimation';

export function createCameraRoute(parent: Group | import('three').Scene) {
  const group = new Group();
  group.name = 'camera-route-preview';
  parent.add(group);
  let previous: CameraTrack | undefined;
  const clear = () => {
    for (const c of group.children)
      if (c instanceof Line || c instanceof Points) {
        c.geometry.dispose();
        (c.material as LineBasicMaterial | PointsMaterial).dispose();
      }
    group.clear();
  };
  return {
    sync(track: CameraTrack | undefined, visible: boolean) {
      group.visible = visible;
      if (track === previous) return;
      previous = track;
      clear();
      if (!track?.keys.length) return;
      const path: Vector3[] = [];
      track.keys.forEach((k, i) => {
        const next = track.keys[i + 1];
        if (!next) return;
        for (let s = 0; s <= 24; s++) {
          const pose = evaluateCamera(
            track,
            k.time + k.hold + ((next.time - k.time - k.hold) * s) / 24,
          )!;
          path.push(new Vector3(...pose.position));
        }
      });
      group.add(
        new Line(
          new BufferGeometry().setFromPoints(path),
          new LineBasicMaterial({ color: '#218f9c' }),
        ),
      );
      group.add(
        new Points(
          new BufferGeometry().setFromPoints(track.keys.map((k) => new Vector3(...k.position))),
          new PointsMaterial({ color: '#ed9e49', size: 9, sizeAttenuation: false }),
        ),
      );
    },
    dispose() {
      clear();
      group.removeFromParent();
    },
  };
}
