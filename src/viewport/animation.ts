import { Matrix4, type Mesh, type Object3D } from 'three';
import { evaluateAnimation } from '../model/animation';
import type { AnimationViewport } from '../ui/AnimationWorkspace';

/** Clock and matrix updates stay outside React, CAD, history and autosave. */
export function createAnimationPreview(
  current: () => AnimationViewport | undefined,
  objects: () => Map<string, { mesh: Mesh; outline: Object3D; boundary?: Object3D }>,
  canvas: HTMLCanvasElement,
  render: () => void,
) {
  let frame = 0,
    stamp = 0,
    time = 0,
    playing = false,
    signature = '',
    driven = new Set<string>();
  const identity = new Matrix4();
  const apply = (matrices: Map<string, Matrix4>) => {
    for (const id of new Set([...driven, ...matrices.keys()])) {
      const node = objects().get(id);
      if (!node) continue;
      for (const object of [node.mesh, node.outline, node.boundary])
        if (object) {
          object.matrixAutoUpdate = false;
          object.matrix.copy(matrices.get(id) ?? identity);
          object.matrixWorldNeedsUpdate = true;
        }
    }
    driven = new Set(matrices.keys());
    canvas.dataset.animationTime = String(time);
    canvas.dataset.animationMatrices =
      matrices.size <= 32 ? JSON.stringify([...matrices].map(([id, m]) => [id, m.elements])) : '';
    render();
  };
  const tick = (now: number) => {
    frame = 0;
    const state = current();
    if (!state?.playing || !state.clip) return;
    time += Math.max(0, (now - stamp) / 1000) * state.speed;
    stamp = now;
    const duration = state.clip.duration;
    if (time > duration || time < 0) {
      if (state.clip.loop) time = ((time % duration) + duration) % duration;
      else {
        time = Math.min(duration, Math.max(0, time));
        apply(evaluateAnimation(state.data, state.clip, time).bodyMatrices);
        state.onFrame(time);
        playing = false;
        state.onEnd(time);
        return;
      }
    }
    apply(evaluateAnimation(state.data, state.clip, time).bodyMatrices);
    state.onFrame(time);
    frame = requestAnimationFrame(tick);
  };
  return {
    sync() {
      const state = current();
      if (!state) {
        cancelAnimationFrame(frame);
        frame = 0;
        playing = false;
        signature = '';
        if (driven.size) apply(new Map());
        return;
      }
      const next = `${state.clip?.id}:${state.time}:${state.speed}`;
      if (!state.playing || !playing || next !== signature) {
        time = state.time;
        stamp = performance.now();
      }
      signature = next;
      playing = state.playing;
      if (!playing) {
        cancelAnimationFrame(frame);
        frame = 0;
        apply(state.matrices);
        state.onFrame(time);
      } else if (!frame) frame = requestAnimationFrame(tick);
    },
    dispose() {
      cancelAnimationFrame(frame);
    },
  };
}
