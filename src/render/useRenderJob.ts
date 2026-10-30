import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderSnapshot } from './snapshot';
import { renderSnapshot, type RenderJobOptions, type RenderJobProgress } from './traceJob';

export type RenderJob = {
  state: 'working' | 'done' | 'cancelled' | 'error';
  name: string;
  progress?: RenderJobProgress;
  blob?: Blob;
  image?: string;
  error?: string;
};
export function useRenderJob() {
  const [job, setJob] = useState<RenderJob>();
  const controller = useRef<AbortController>(undefined),
    generation = useRef(0),
    image = useRef<string>(undefined);
  const clearImage = () => {
    if (image.current) URL.revokeObjectURL(image.current);
    image.current = undefined;
  };
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      clearImage();
    },
    [],
  );
  const start = useCallback((snapshot: RenderSnapshot, options: RenderJobOptions, name: string) => {
    if (controller.current) {
      snapshot.dispose();
      return;
    }
    clearImage();
    const token = ++generation.current,
      abort = new AbortController();
    controller.current = abort;
    setJob({ state: 'working', name });
    void renderSnapshot(snapshot, options, abort.signal, (progress) => {
      if (token === generation.current) setJob({ state: 'working', name, progress });
    })
      .then((blob) => {
        if (token !== generation.current) return;
        image.current = URL.createObjectURL(blob);
        setJob((old) => ({ ...old!, state: 'done', blob, image: image.current }));
      })
      .catch((error: Error) => {
        if (token !== generation.current) return;
        setJob((old) => ({
          ...old!,
          state: error.name === 'AbortError' ? 'cancelled' : 'error',
          error: error.message,
        }));
      })
      .finally(() => {
        if (token === generation.current) controller.current = undefined;
      });
  }, []);
  const cancel = () => controller.current?.abort();
  const dismiss = () => {
    if (controller.current) return;
    clearImage();
    setJob(undefined);
  };
  return { job, start, cancel, dismiss };
}
