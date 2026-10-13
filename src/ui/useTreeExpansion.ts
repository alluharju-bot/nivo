import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import type { Body, BodyGroup } from '../model/project';
import { groupAncestors } from '../model/groups';

const storageKey = (id: string) => `nivo-tree-folds:${id}`;
function read(id: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(id)) ?? '[]');
    return new Set<string>(
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string').slice(0, 1000)
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

/** Lives above the tree: changing tabs or hiding the browser must not reset folds. */
export function useTreeExpansion(
  projectId: string,
  bodies: Body[],
  groups: BodyGroup[],
  selected: string[],
  primary?: string,
  selectedGroup?: string,
) {
  const initial = useMemo(() => read(projectId), [projectId]);
  const [state, setState] = useState({ projectId, collapsed: initial });
  const collapsed = state.projectId === projectId ? state.collapsed : initial;
  const activeKey =
    selectedGroup ?? (primary && selected.includes(primary) ? primary : selected.at(-1));
  const parents = useMemo(
    () =>
      groupAncestors(
        groups,
        selectedGroup
          ? groups.find((g) => g.id === selectedGroup)?.parentId
          : bodies.find((b) => b.id === activeKey)?.groupId,
      ).map((g) => g.id),
    [groups, bodies, activeKey, selectedGroup],
  );
  const revealKey = activeKey ? JSON.stringify([projectId, activeKey, parents]) : '';
  const previous = useRef(revealKey);
  const setCollapsed = (update: SetStateAction<Set<string>>) =>
    setState((old) => {
      const current = old.projectId === projectId ? old.collapsed : initial;
      return { projectId, collapsed: typeof update === 'function' ? update(current) : update };
    });
  useEffect(() => {
    if (state.projectId !== projectId) setState({ projectId, collapsed: initial });
  }, [projectId, initial, state.projectId]);
  useEffect(() => {
    if (state.projectId !== projectId) return;
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify([...collapsed]));
    } catch {
      /* Storage can be unavailable; session state still works. */
    }
  }, [projectId, state, collapsed]);
  useEffect(() => {
    if (previous.current === revealKey) return;
    previous.current = revealKey;
    if (parents.length)
      setCollapsed((old) => {
        if (!parents.some((id) => old.has(id))) return old;
        const next = new Set(old);
        parents.forEach((id) => next.delete(id));
        return next;
      });
  }, [revealKey]);
  return { collapsed, setCollapsed, activeKey, revealKey };
}
