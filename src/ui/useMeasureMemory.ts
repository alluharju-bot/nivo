import { useRef, useState } from 'react';
import { rememberMeasures } from '../model/measureMemory';

/** Session-local and project-specific: reloading preserves it, opening another project does not mix it. */
export function useMeasureMemory(projectId: string) {
  const load = (id: string): number[] => {
    try {
      const parsed: unknown = JSON.parse(
        sessionStorage.getItem(`nivo:measure-memory:${id}`) ?? '[]',
      );
      return Array.isArray(parsed)
        ? rememberMeasures([], parsed.filter((n): n is number => typeof n === 'number').reverse())
        : [];
    } catch {
      return [];
    }
  };
  const state = useRef<{ id: string; values: number[] } | undefined>(undefined);
  const [, redraw] = useState(0);
  if (!state.current || state.current.id !== projectId)
    state.current = { id: projectId, values: load(projectId) };
  const remember = (...values: number[]) => {
    if (!state.current || state.current.id !== projectId) return;
    const next = rememberMeasures(state.current.values, values);
    if (next.join(',') === state.current.values.join(',')) return;
    state.current.values = next;
    try {
      sessionStorage.setItem(`nivo:measure-memory:${projectId}`, JSON.stringify(next));
    } catch {}
    redraw((n) => n + 1);
  };
  return { values: state.current.values, remember };
}
