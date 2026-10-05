import { simplifyStroke } from '../model/stroke';
import * as THREE from 'three';
import type { ViewportProps } from './types';
import type { KnifeRay } from '../cad/modeling';
import { sampleBezier } from '../model/bezier';

type Point = [number, number];
/** A screen stroke is captured against one camera pose; the kernel receives exact view rays. */
export function installKnife(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  camera: () => THREE.Camera,
  current: () => ViewportProps,
) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('knife-overlay');
  svg.dataset.testid = 'knife-preview';
  const path = document.createElementNS(ns, 'polyline'),
    handles = document.createElementNS(ns, 'polyline');
  path.setAttribute('class', 'knife-stroke');
  handles.setAttribute('class', 'knife-controls');
  svg.append(handles, path);
  container.append(svg);
  const hint = document.createElement('div');
  hint.className = 'knife-hint';
  hint.hidden = true;
  container.append(hint);
  let points: Point[] = [],
    hover: Point | undefined,
    snapshot: THREE.Camera | undefined,
    down: Point | undefined,
    dragged = false;
  let epoch = current().epoch,
    mode = current().knifeMode,
    command = current().knifeCommand?.id;
  const clear = () => {
    points = [];
    hover = undefined;
    snapshot = undefined;
    down = undefined;
    draw();
  };
  const local = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const screenPath = (preview: boolean) => {
    const list = [...points];
    if (preview && hover && (mode !== 'free' || !down)) list.push(hover);
    if (mode === 'curve' && list.length >= 4)
      return sampleBezier(
        list.slice(0, 4).map((p) => [...p, 0]),
        64,
      ).map((p) => p.slice(0, 2) as Point);
    return list;
  };
  function draw() {
    const active = current().tool === 'knife';
    svg.style.display = active ? 'block' : 'none';
    hint.hidden = !active;
    svg.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
    path.setAttribute(
      'points',
      screenPath(true)
        .map((p) => p.join(','))
        .join(' '),
    );
    handles.setAttribute(
      'points',
      mode === 'curve'
        ? [...points, ...(hover ? [hover] : [])].map((p) => p.join(',')).join(' ')
        : '',
    );
    svg.querySelectorAll('circle').forEach((n) => n.remove());
    points.forEach((p, i) => {
      const mark = document.createElementNS(ns, 'circle');
      mark.setAttribute('cx', String(p[0]));
      mark.setAttribute('cy', String(p[1]));
      mark.setAttribute('r', '4');
      mark.setAttribute('class', i === 0 ? 'knife-start' : 'knife-point');
      svg.append(mark);
    });
    hint.textContent = !points.length
      ? 'Veitsi · Piirrä leikkaus kappaleen yli'
      : mode === 'curve'
        ? [
            '',
            'Valitse ensimmäinen ohjauspiste',
            'Valitse toinen ohjauspiste',
            'Valitse käyrän loppupiste',
          ][Math.min(points.length, 3)]
        : mode === 'polyline'
          ? `${points.length} pistettä · Enter leikkaa · alkupiste sulkee reitin`
          : 'Piirrä leikkaus kappaleen yli · Esc peruu';
  }
  function raysFor(list: Point[]): KnifeRay[] {
    const raycaster = new THREE.Raycaster();
    const c = snapshot ?? camera();
    return list.map((p) => {
      raycaster.setFromCamera(
        new THREE.Vector2(
          (p[0] / canvas.clientWidth) * 2 - 1,
          1 - (p[1] / canvas.clientHeight) * 2,
        ),
        c,
      );
      return {
        origin: raycaster.ray.origin.toArray(),
        direction: raycaster.ray.direction.toArray(),
      };
    });
  }
  function finish() {
    if (current().busy || points.length < 2 || (mode === 'curve' && points.length < 4)) return;
    const list = screenPath(false);
    const sampled = mode === 'free' ? simplifyStroke(list) : list;
    if (sampled.length > 129) {
      hint.textContent =
        'Reitti on liian yksityiskohtainen. Piirrä lyhyempi viilto tai jaa leikkaus osiin.';
      return;
    }
    const rays = raysFor(mode === 'curve' ? points : sampled);
    const normal =
      mode === 'curve'
        ? (snapshot ?? camera()).getWorldDirection(new THREE.Vector3()).toArray()
        : undefined;
    clear();
    current().onKnife(rays, normal);
  }
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const pointerDown = (e: PointerEvent) => {
    if (current().tool !== 'knife' || current().modalOpen || current().busy) return;
    if (e.button !== 0) {
      if (points.length) clear();
      return;
    }
    stop(e);
    canvas.focus();
    down = local(e);
    dragged = false;
    if (!snapshot) {
      snapshot = camera().clone();
      snapshot.updateMatrixWorld();
    }
    canvas.setPointerCapture(e.pointerId);
    if (mode === 'free') {
      points = [down];
      hover = undefined;
    }
  };
  const pointerMove = (e: PointerEvent) => {
    if (current().tool !== 'knife' || current().modalOpen || current().busy) return;
    const p = local(e);
    hover = p;
    if (down && Math.hypot(p[0] - down[0], p[1] - down[1]) > 4) dragged = true;
    if (mode === 'free' && down) {
      const last = points.at(-1)!;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 4) {
        points.push(p);
        if (points.length > 1024) points = simplifyStroke(points);
      }
    }
    if (down && mode === 'line' && dragged) points = [down];
    if (points.length || down) stop(e);
    draw();
  };
  const pointerUp = (e: PointerEvent) => {
    if (current().tool !== 'knife' || e.button !== 0 || !down) return;
    stop(e);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const p = local(e);
    if (mode === 'free') {
      if (dragged) {
        points.push(p);
        if (points.length > 3 && Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) < 12)
          points[points.length - 1] = points[0];
        down = undefined;
        hover = undefined;
        finish();
      } else clear();
      return;
    }
    if (mode === 'line' && dragged) points = [down, p];
    else if (
      mode === 'polyline' &&
      points.length >= 3 &&
      Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) < 12
    ) {
      points.push(points[0]);
      down = undefined;
      hover = undefined;
      finish();
      return;
    } else if (!points.length || Math.hypot(p[0] - points.at(-1)![0], p[1] - points.at(-1)![1]) > 1)
      points.push(p);
    down = undefined;
    hover = undefined;
    if ((mode === 'line' && points.length === 2) || (mode === 'curve' && points.length === 4))
      finish();
    else draw();
  };
  const key = (e: KeyboardEvent) => {
    if (
      current().tool !== 'knife' ||
      current().busy ||
      current().modalOpen ||
      (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')
    )
      return;
    if (e.key === 'Escape') {
      stop(e);
      if (points.length || down) clear();
      else current().onKnifeExit();
    } else if (e.key === 'Enter') {
      stop(e);
      finish();
    } else if (e.key === 'Backspace') {
      stop(e);
      points.pop();
      if (!points.length) snapshot = undefined;
      draw();
    }
  };
  const wheel = (e: WheelEvent) => {
    if (current().tool === 'knife' && points.length) stop(e);
  };
  const cancel = () => clear();
  canvas.addEventListener('pointerdown', pointerDown, true);
  canvas.addEventListener('pointermove', pointerMove, true);
  canvas.addEventListener('pointerup', pointerUp, true);
  canvas.addEventListener('pointercancel', cancel, true);
  canvas.addEventListener('wheel', wheel, { capture: true, passive: false });
  window.addEventListener('keydown', key, true);
  const resizeObserver = new ResizeObserver(clear);
  resizeObserver.observe(canvas);
  return {
    clear,
    sync() {
      const p = current();
      if (p.epoch !== epoch || p.knifeMode !== mode || p.tool !== 'knife') {
        epoch = p.epoch;
        mode = p.knifeMode;
        clear();
      }
      if (p.knifeCommand?.id !== command) {
        command = p.knifeCommand?.id;
        if (p.knifeCommand?.action === 'finish') finish();
        else clear();
      }
      draw();
    },
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown, true);
      canvas.removeEventListener('pointermove', pointerMove, true);
      canvas.removeEventListener('pointerup', pointerUp, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', key, true);
      svg.remove();
      hint.remove();
    },
  };
}
