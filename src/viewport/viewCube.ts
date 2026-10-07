import { Matrix4, Vector3, type Camera } from 'three';
import type { Vec3 } from '../model/project';

const faces: { name: string; normal: Vec3; up: Vec3 }[] = [
  { name: 'Edestä', normal: [0, -1, 0], up: [0, 0, 1] },
  { name: 'Takaa', normal: [0, 1, 0], up: [0, 0, 1] },
  { name: 'Oikealta', normal: [1, 0, 0], up: [0, 0, 1] },
  { name: 'Vasemmalta', normal: [-1, 0, 0], up: [0, 0, 1] },
  { name: 'Ylhäältä', normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'Alhaalta', normal: [0, 0, -1], up: [0, -1, 0] },
];
const cssVector = (v: Vector3) => new Vector3(v.x, -v.y, v.z);
const cssMatrix = (m: Matrix4) => `matrix3d(${m.elements.join(',')})`;

export function createViewCube(
  container: HTMLElement,
  camera: () => Camera,
  orient: (normal: Vec3, up: Vec3) => void,
  rotate: (dx: number, dy: number) => void,
) {
  const host = document.createElement('div');
  host.className = 'view-cube';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Näkymäkuutio');
  host.title = 'Napsauta tahkoa: vaihda suuntaa · Vedä: kierrä näkymää · Zoomaus säilyy';
  const cube = document.createElement('div');
  cube.className = 'view-cube-solid';
  host.append(cube);
  const buttons = faces.map(({ name, normal, up }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'view-cube-face';
    button.textContent = name;
    button.setAttribute('aria-label', `Näkymä: ${name}`);
    const n = new Vector3(...normal),
      v = new Vector3(...up),
      u = v.clone().cross(n);
    button.style.transform = cssMatrix(
      new Matrix4()
        .makeBasis(cssVector(u), cssVector(v.negate()), cssVector(n))
        .setPosition(cssVector(n).multiplyScalar(32)),
    );
    cube.append(button);
    button.addEventListener('click', () => {
      if (!moved) orient(normal, up);
      moved = false;
    });
    return button;
  });
  let press: { id: number; x: number; y: number; lastX: number; lastY: number } | undefined;
  let moved = false;
  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    moved = false;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.stopPropagation();
  });
  host.addEventListener('pointermove', (event) => {
    if (press?.id !== event.pointerId) return;
    if (!moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
    moved = true;
    rotate((event.clientX - press.lastX) * 0.012, (event.clientY - press.lastY) * 0.012);
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    event.stopPropagation();
  });
  host.addEventListener('pointerup', () => {
    press = undefined;
  });
  host.addEventListener('pointercancel', () => {
    press = undefined;
    moved = true;
  });
  host.addEventListener('lostpointercapture', () => {
    press = undefined;
  });
  host.addEventListener('keydown', (event) => {
    const delta = {
      ArrowLeft: [-0.15, 0],
      ArrowRight: [0.15, 0],
      ArrowUp: [0, -0.15],
      ArrowDown: [0, 0.15],
    }[event.key];
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      rotate(delta[0], delta[1]);
    }
  });
  container.append(host);
  return {
    update() {
      const c = camera();
      const flip = new Matrix4().makeScale(1, -1, 1);
      cube.style.transform = cssMatrix(
        flip
          .clone()
          .multiply(new Matrix4().makeRotationFromQuaternion(c.quaternion.clone().invert()))
          .multiply(flip),
      );
      const normal = c.getWorldDirection(new Vector3()).negate();
      buttons.forEach((button, i) =>
        button.setAttribute(
          'aria-pressed',
          String(normal.dot(new Vector3(...faces[i].normal)) > 0.99999),
        ),
      );
    },
    dispose() {
      host.remove();
    },
  };
}
