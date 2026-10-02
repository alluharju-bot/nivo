import { useEffect, useRef, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { Body } from '../model/project';
import type { EdgeDetailResult } from '../cad/protocol';

type Request = {
  body: Body;
  indices: number[];
  operation: 'fillet' | 'chamfer';
  size: number;
  key: string;
};
type Preview = {
  body?: Body;
  key?: string;
  result?: EdgeDetailResult;
  size?: number;
  error?: string;
  loading: boolean;
};

/** One request in flight, one latest request waiting. Keep the last valid preview while dragging. */
export function useEdgeDetailPreview(
  cad: CadClient,
  body: Body | undefined,
  indices: number[],
  operation: 'fillet' | 'chamfer',
  size: number,
) {
  const [state, setState] = useState<Preview>({ loading: false });
  const next = useRef<Request | undefined>(undefined);
  const running = useRef(false);
  const key = `${operation}:${indices.join(',')}`;
  const valid =
    !!body && indices.length > 0 && Number.isFinite(size) && size >= 0.1 && size <= 100_000;
  useEffect(() => {
    const request = valid ? { body: body!, indices, operation, size, key } : undefined;
    next.current = request;
    setState((old) => ({
      ...(request && old.body === body && old.key === key ? old : {}),
      body,
      key,
      error: undefined,
      loading: !!request,
    }));
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        while (next.current) {
          const current = next.current;
          try {
            const result = await cad.edgeDetail(
              current.body,
              current.indices,
              current.operation,
              current.size,
            );
            // An older size on the same selection is useful while the latest size is computing.
            // Different targets, modes, cancelled gestures and invalid input must never leak through.
            if (next.current?.body === current.body && next.current?.key === current.key)
              setState({
                body: current.body,
                key: current.key,
                result,
                size: current.size,
                loading: next.current !== current,
              });
          } catch (e) {
            if (next.current === current)
              setState({
                body: current.body,
                key: current.key,
                error: (e as Error).message,
                loading: false,
              });
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
  }, [cad, body, key, size, valid]);
  // Hide a previous target immediately, before the effect catches up with this render.
  if (!valid)
    return {
      loading: false,
      error: body && indices.length ? 'Anna mitta väliltä 0,1–100 000 mm.' : undefined,
    };
  if (state.body !== body || state.key !== key) return { loading: true };
  return state;
}
