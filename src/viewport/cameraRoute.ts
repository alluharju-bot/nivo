import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  Vector3,
  Vector2,
  Plane,
  Raycaster,
  LineSegments,
  type Camera,
} from 'three';
import { evaluateCamera, type CameraTrack, type CameraKey } from '../model/cameraAnimation';
import type { AnimationViewport } from '../ui/AnimationWorkspace';

export function createCameraRoute(
  parent: Group | import('three').Scene,
  interaction?: {
    canvas: HTMLCanvasElement;
    camera: () => Camera;
    state: () => AnimationViewport | undefined;
    controls: (enabled: boolean) => void;
    render: () => void;
  },
) {
  const group = new Group();
  group.name = 'camera-route-preview';
  parent.add(group);
  let previous: CameraTrack | undefined;
  const markers = new Map<string, Group>();
  let drag:
    | {
        key: CameraKey;
        plane: Plane;
        start: Vector3;
        position: Vector3;
        pointer: number;
        moved: boolean;
      }
    | undefined;
  const ray = new Raycaster();
  const pointerRay = (event: PointerEvent) => {
    const rect = interaction!.canvas.getBoundingClientRect();
    ray.setFromCamera(
      new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      interaction!.camera(),
    );
    return ray.ray;
  };
  const consume = (event: PointerEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const down = (event: PointerEvent) => {
    const state = interaction?.state();
    if (
      !interaction ||
      !state?.showRoute ||
      !state.cameraEditable ||
      state.playing ||
      state.cameraEnabled ||
      state.picking ||
      event.button !== 0
    )
      return;
    const rect = interaction.canvas.getBoundingClientRect(),
      camera = interaction.camera();
    camera.updateMatrixWorld();
    const key = state.clip?.camera?.keys
      .map((key) => {
        const p = new Vector3(...key.position).project(camera);
        return {
          key,
          distance:
            p.z < -1 || p.z > 1
              ? Infinity
              : Math.hypot(
                  rect.left + ((p.x + 1) / 2) * rect.width - event.clientX,
                  rect.top + ((1 - p.y) / 2) * rect.height - event.clientY,
                ),
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .find((k) => k.distance < 22)?.key;
    if (!key) return;
    const position = new Vector3(...key.position);
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new Vector3()),
      position,
    );
    const start = pointerRay(event).intersectPlane(plane, new Vector3());
    if (!start) return;
    consume(event);
    interaction.controls(false);
    interaction.canvas.setPointerCapture(event.pointerId);
    drag = { key, plane, start, position, pointer: event.pointerId, moved: false };
    state.onCameraSelect(key.id);
  };
  const move = (event: PointerEvent) => {
    if (!drag) return;
    consume(event);
    const point = pointerRay(event).intersectPlane(drag.plane, new Vector3());
    if (!point) return;
    drag.position
      .copy(point)
      .sub(drag.start)
      .add(new Vector3(...drag.key.position));
    drag.moved = drag.position.distanceTo(new Vector3(...drag.key.position)) > 0.1;
    markers.get(drag.key.id)?.position.copy(drag.position);
    interaction!.render();
  };
  const finish = (event: PointerEvent) => {
    if (!drag) return;
    consume(event);
    const d = drag;
    drag = undefined;
    interaction!.controls(true);
    if (interaction!.canvas.hasPointerCapture(d.pointer))
      interaction!.canvas.releasePointerCapture(d.pointer);
    if (event.type === 'pointerup' && d.moved) {
      // Translation preserves the view direction and field of view.
      const target = new Vector3(...d.key.target)
        .add(d.position)
        .sub(new Vector3(...d.key.position));
      interaction!.state()?.onCameraMove(d.key.id, d.position.toArray(), target.toArray());
    } else markers.get(d.key.id)?.position.set(...d.key.position);
    interaction!.render();
  };
  for (const [type, handler] of [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', finish],
    ['pointercancel', finish],
    ['lostpointercapture', finish],
  ] as const)
    interaction?.canvas.addEventListener(type, handler, true);
  const clear = () => {
    group.traverse((c) => {
      if (c instanceof Line || c instanceof Points) {
        c.geometry.dispose();
        (c.material as LineBasicMaterial | PointsMaterial).dispose();
      }
    });
    group.clear();
    markers.clear();
  };
  return {
    sync(track: CameraTrack | undefined, visible: boolean, selected?: string) {
      group.visible = visible;
      for (const [id, marker] of markers)
        marker.traverse((o) => {
          if (o instanceof Line)
            (o.material as LineBasicMaterial).color.set(id === selected ? '#e98723' : '#218f9c');
        });
      if (track === previous) return;
      previous = track;
      clear();
      if (!track?.keys.length) return;
      for (const key of track.keys) {
        const marker = new Group();
        marker.position.set(...key.position);
        marker.up.set(0, 0, 1);
        marker.lookAt(new Vector3(...key.target));
        const corners = [
          [-80, -45, 130],
          [80, -45, 130],
          [80, 45, 130],
          [-80, 45, 130],
        ].map((p) => new Vector3(...p));
        const lines: Vector3[] = [];
        corners.forEach((c, i) => lines.push(new Vector3(), c, c, corners[(i + 1) % 4]));
        marker.add(
          new LineSegments(
            new BufferGeometry().setFromPoints(lines),
            new LineBasicMaterial({
              color: key.id === selected ? '#e98723' : '#218f9c',
              depthTest: false,
            }),
          ),
        );
        markers.set(key.id, marker);
        group.add(marker);
      }
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
      for (const [type, handler] of [
        ['pointerdown', down],
        ['pointermove', move],
        ['pointerup', finish],
        ['pointercancel', finish],
        ['lostpointercapture', finish],
      ] as const)
        interaction?.canvas.removeEventListener(type, handler, true);
      clear();
      group.removeFromParent();
    },
  };
}
