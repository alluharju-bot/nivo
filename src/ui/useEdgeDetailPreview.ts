import { useEffect, useRef, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { Body } from '../model/project';
import type { EdgeDetailResult } from '../cad/protocol';

export function useEdgeDetailPreview(
  cad: CadClient,
  body: Body | undefined,
  indices: number[],
  operation: 'fillet' | 'chamfer',
  size: number,
) {
  const [state, setState] = useState<{
    result?: EdgeDetailResult;
    error?: string;
    loading: boolean;
  }>({ loading: false });
  const next = useRef<
    { body: Body; indices: number[]; operation: 'fillet' | 'chamfer'; size: number } | undefined
  >(undefined);
  const running = useRef(false);
  const key = indices.join(',');
  useEffect(() => {
    const request =
      body && indices.length && Number.isFinite(size) && size >= 0.1
        ? { body, indices, operation, size }
        : undefined;
    next.current = request;
    setState({ loading: !!request });
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
            if (next.current === current) setState({ result, loading: false });
          } catch (e) {
            if (next.current === current) setState({ error: (e as Error).message, loading: false });
          }
          if (next.current === current) next.current = undefined;
        }
      } finally {
        running.current = false;
      }
    };
    const timer = window.setTimeout(() => void run(), 180);
    return () => {
      window.clearTimeout(timer);
      if (next.current === request) next.current = undefined;
    };
  }, [cad, body, key, operation, size]);
  return state;
}
