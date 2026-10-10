import { useEffect, useRef, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { Body, FaceRef } from '../model/project';

/** Coalesce pointer updates: at most one preview request can be in flight. */
export function useOffsetOutline(
  cad: CadClient,
  body: Body | undefined,
  face: FaceRef | undefined,
  distance: number,
) {
  const [preview, setPreview] = useState<{ lines?: number[]; error?: string; distance?: number }>(
    {},
  );
  const next = useRef<{ body: Body; face: FaceRef; distance: number } | undefined>(undefined);
  const running = useRef(false);
  useEffect(() => {
    const request =
      body && face && Number.isFinite(distance) && Math.abs(distance) >= 0.1
        ? { body, face, distance }
        : undefined;
    next.current = request;
    // An old outline must never appear on a new target, or while typing an invalid value.
    setPreview({});
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        while (next.current) {
          const current = next.current;
          try {
            const lines = await cad.offsetOutline(current.body, current.face, current.distance);
            if (next.current === current) setPreview({ lines, distance: current.distance });
          } catch (error) {
            if (next.current === current) setPreview({ error: (error as Error).message });
          }
          if (next.current === current) next.current = undefined;
        }
      } finally {
        running.current = false;
      }
    };
    void run();
    return () => {
      if (next.current === request) next.current = undefined;
    };
  }, [cad, body, face, distance]);
  return preview;
}
