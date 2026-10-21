import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url';
import { fractureMesh } from './fracture';
import { createSimulation } from './physics';
import type { FractureRequest, FractureReply } from './types';

const send = (message: FractureReply) => self.postMessage(message);
let api: ReturnType<typeof Module> | undefined;
let simulation: Awaited<ReturnType<typeof createSimulation>> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
function pause() {
  clearInterval(timer);
  timer = undefined;
}
function play() {
  pause();
  timer = setInterval(() => {
    if (!simulation) return;
    try {
      for (let i = 0; i < simulation.stepsPerFrame; i++) simulation.step();
      send({
        type: 'poses',
        poses: simulation.poses(),
        time: simulation.time,
        stopped: simulation.stopped,
        limitReached: simulation.limitReached,
      });
      if (simulation.stopped) pause();
    } catch (e) {
      pause();
      send({ type: 'error', message: (e as Error).message });
    }
  }, 1000 / 30);
}
self.onmessage = async ({ data }: MessageEvent<FractureRequest>) => {
  if (data.type === 'pause') {
    pause();
    if (simulation)
      send({
        type: 'poses',
        poses: simulation.poses(),
        time: simulation.time,
        stopped: true,
        limitReached: simulation.limitReached,
      });
    return;
  }
  if (data.type === 'resume') {
    play();
    return;
  }
  const token = ++generation;
  pause();
  simulation?.dispose();
  simulation = undefined;
  try {
    if (data.type === 'fracture') {
      const kernel = await (api ??= Module({ locateFile: () => wasmURL }).then((m) => {
        m.setup();
        return m;
      }));
      if (token !== generation) return;
      const result = fractureMesh(kernel, data.mesh, data.options, (value) =>
        send({ type: 'progress', value }),
      );
      send({ type: 'result', result });
    } else {
      const next = await createSimulation(
        data.result,
        data.obstacles,
        data.ground,
        data.kick,
        data.motion,
        data.worldOrigin,
      );
      if (token !== generation) {
        next.dispose();
        return;
      }
      simulation = next;
      play();
    }
  } catch (e) {
    if (token === generation)
      send({ type: 'error', message: (e as Error).message || 'Rikkominen epäonnistui.' });
  }
};
