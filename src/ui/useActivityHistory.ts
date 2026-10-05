import { useEffect, useRef, useState } from 'react';
import {
  ActivityJournal,
  selectionDescription,
  type ActionInfo,
  type Activity,
  type SelectionContext,
} from '../model/activity';
export function useActivityHistory(
  projectId: string,
  ready: boolean,
  activity?: Activity & { projectId: string },
) {
  const journal = useRef(new ActivityJournal(projectId));
  const loaded = useRef('');
  const observed = useRef('');
  const [, update] = useState(0);
  const persist = () => {
    try {
      sessionStorage.setItem('nivo-activity', journal.current.serialize());
    } catch {
      /* Optional tab history. */
    }
    update((n) => n + 1);
  };
  useEffect(() => {
    if (!ready || loaded.current === projectId) return;
    let saved: string | undefined;
    try {
      saved = sessionStorage.getItem('nivo-activity') ?? undefined;
    } catch {}
    journal.current = new ActivityJournal(projectId, saved);
    loaded.current = projectId;
    update((n) => n + 1);
  }, [projectId, ready]);
  useEffect(() => {
    if (!ready || !activity || activity.projectId !== projectId || observed.current === activity.id)
      return;
    observed.current = activity.id;
    journal.current.record(activity, activity.kind);
    persist();
  }, [activity, ready, projectId]);
  return {
    entries: journal.current.projectId === projectId ? journal.current.entries : [],
    record: (info: ActionInfo, kind: Activity['kind']) => {
      if (ready && loaded.current === projectId) {
        journal.current.record(info, kind);
        persist();
      }
    },
    prepare: (context: SelectionContext) => {
      if (ready && loaded.current === projectId) {
        journal.current.record(
          { label: `Valinta: ${selectionDescription(context)}`, context },
          'selection',
        );
        persist();
      }
    },
  };
}
