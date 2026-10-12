import { useEffect, useRef, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { Body } from '../model/project';
import type { EdgeDetailResult } from '../cad/protocol';

type Target = { body: Body; indices: number[]; editing?: boolean };
type Request = { targets: Target[]; operation: 'fillet' | 'chamfer'; size: number };
type Preview = {
  request?: Request;
  results?: EdgeDetailResult[];
  size?: number;
  error?: string;
  loading: boolean;
};

/** One batch in flight and one latest batch waiting. A failed target cannot
 * produce a partial commit or an apparently successful preview of the batch. */
export function useEdgeDetailPreview(
  cad: CadClient,
  targets: Target[],
  operation: 'fillet' | 'chamfer',
  size: number,
) {
  const [state, setState] = useState<Preview>({ loading: false });
  const next = useRef<Request | undefined>(undefined),
    running = useRef(false);
  const valid = targets.length > 0 && Number.isFinite(size) && size >= 0.1 && size <= 100_000;
  useEffect(() => {
    const request = valid ? { targets, operation, size } : undefined;
    next.current = request;
    setState((old) => ({
      ...(request && old.request?.targets === targets && old.request.operation === operation
        ? old
        : {}),
      request,
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
            const results: EdgeDetailResult[] = [];
            for (const target of current.targets) {
              try {
                results.push(
                  await cad.edgeDetail(
                    target.body,
                    target.indices,
                    current.operation,
                    current.size,
                    !!target.editing,
                  ),
                );
              } catch (e) {
                throw new Error(`${target.body.name}: ${(e as Error).message}`);
              }
              if (
                next.current?.targets !== current.targets ||
                next.current.operation !== current.operation
              )
                break;
            }
            if (
              next.current?.targets === current.targets &&
              next.current.operation === current.operation
            )
              setState({
                request: current,
                results,
                size: current.size,
                loading: next.current !== current,
              });
          } catch (e) {
            if (next.current === current)
              setState({ request: current, error: (e as Error).message, loading: false });
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
  }, [cad, targets, operation, size, valid]);
  if (!valid)
    return {
      loading: false,
      error: targets.length ? 'Anna mitta väliltä 0,1–100 000 mm.' : undefined,
    };
  if (state.request?.targets !== targets || state.request.operation !== operation)
    return { loading: true };
  return state;
}
