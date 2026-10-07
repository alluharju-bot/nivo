import { shareProjectData } from './model/sharing';
import { isPointDimension, type Vec3 } from './model/project';
import { resolveAnchor } from './model/guides';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CadClient } from './cad/client';
import type { BodyMesh } from './cad/protocol';
import {
  freshProject,
  projectSchema,
  projectValidationMessage,
  type Project,
} from './model/project';
import { History } from './model/history';
import { loadLocalSession, saveLocal } from './storage/projects';
import { synchronizeComponents } from './model/components';
import { assertHolds } from './model/holds';
import type { ActionInfo, Activity, SelectionContext } from './model/activity';
import { uid } from './model/project';

export function useEditor() {
  const [cad] = useState(() => new CadClient());
  const [history] = useState(() => new History(freshProject()));
  const [project, setProject] = useState(history.current);
  const [meshes, setMeshes] = useState<BodyMesh[]>([]);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Valmistellaan työtilaa…');
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const actionContext = useRef<SelectionContext>({ ids: [] });
  const [activity, setActivity] = useState<Activity & { projectId: string }>();
  const revision = useRef(0);
  const saveRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(
    (next: Project) => {
      const r = ++saveRevision.current;
      const snapshot = history.serialize();
      setSaveStatus('Tallennetaan…');
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (r !== saveRevision.current) return;
          const historySaved = await saveLocal(next, snapshot);
          if (r === saveRevision.current)
            setSaveStatus(
              historySaved
                ? 'Tallessa selaimessa'
                : 'Malli tallessa; historia ei mahtunut tallennukseen',
            );
        })
        .catch((e: Error) => {
          if (r === saveRevision.current) {
            setSaveStatus('Tallennus epäonnistui');
            setError(e.message);
          }
        });
    },
    [history],
  );

  useEffect(() => {
    const current = ++revision.current;
    void (async () => {
      try {
        const restored = await loadLocalSession();
        const initial = restored?.project ?? history.current;
        const built = await cad.build(initial.bodies);
        if (current !== revision.current) return;
        history.current = initial;
        history.restore(restored?.history);
        setProject(initial);
        setMeshes(built);
        setSaveStatus(restored ? 'Tallessa selaimessa' : 'Uusi projekti');
        setMessage(
          restored
            ? 'Edellinen työ palautettu. Voit jatkaa siitä, mihin jäit.'
            : 'Aloita suorakulmiosta tai tutustu esimerkkikaappiin.',
        );
      } catch (e) {
        if (current === revision.current) setError((e as Error).message);
      } finally {
        if (current === revision.current) {
          setReady(true);
          setBusy(false);
        }
      }
    })();
    return () => {
      revision.current++;
      cad.cancel();
    };
  }, [cad, history]);

  const transact = useCallback(
    async (
      candidate: Project | (() => Promise<Project>),
      label: string,
      mode: 'commit' | 'replace' | 'undo' | 'redo' | 'restore' = 'commit',
      details?: Omit<ActionInfo, 'label'>,
    ) => {
      const current = ++revision.current;
      const info =
        mode === 'undo' ? history.undoInfo : mode === 'redo' ? history.redoInfo : undefined;
      const context = mode === 'replace' ? { ids: [] } : (info?.context ?? actionContext.current);
      const action: ActionInfo = { label, context, actionId: uid(), ...info, ...details };
      setBusy(true);
      setError('');
      setMessage('Lasketaan tarkkaa geometriaa…');
      try {
        let resolved = typeof candidate === 'function' ? await candidate() : candidate;
        if (current !== revision.current) return false;
        if (mode === 'commit') {
          assertHolds(history.current, resolved);
          resolved = await synchronizeComponents(history.current, resolved, (source, targets) =>
            cad.instances(source, targets),
          );
          assertHolds(history.current, resolved);
        }
        if (current !== revision.current) return false;
        const validated = projectSchema.safeParse({
          ...resolved,
          dimensions: resolved.dimensions.map((d) =>
            isPointDimension(d)
              ? {
                  ...d,
                  fallback: [d.start, d.end].map(
                    (a, i) =>
                      resolveAnchor(resolved.bodies, a) ??
                      resolveAnchor(history.current.bodies, a) ??
                      d.fallback[i],
                  ) as [Vec3, Vec3],
                }
              : d,
          ),
          updatedAt: new Date().toISOString(),
        });
        if (!validated.success) throw new Error(projectValidationMessage(validated.error));
        const next = shareProjectData(history.current, validated.data);
        // View-only changes retain the exact mesh objects and avoid worker round trips.
        const built =
          next.bodies === history.current.bodies ? undefined : await cad.build(next.bodies);
        if (current !== revision.current) return false;
        if (mode === 'undo') history.undo();
        else if (mode === 'redo') history.redo();
        else if (mode === 'restore') {
          if (!details?.actionId || !history.restoreBeforeAction(details.actionId))
            throw new Error('Toiminto ei ole enää kumoamishistoriassa.');
        } else history.commit(next, action);
        history.adopt(next);
        setProject(next);
        if (built) setMeshes(built);
        setMessage(label);
        setActivity({
          ...action,
          id: uid(),
          projectId: next.id,
          at: Date.now(),
          kind: mode === 'undo' || mode === 'restore' ? 'undo' : mode === 'redo' ? 'redo' : 'edit',
          label: info ? `${mode === 'undo' ? 'Peruttu' : 'Palautettu'}: ${info.label}` : label,
        });
        persist(next);
        return true;
      } catch (e) {
        if (current === revision.current) {
          setError((e as Error).message);
          setMessage('Edellinen ehjä malli säilyi.');
        }
        return false;
      } finally {
        if (current === revision.current) setBusy(false);
      }
    },
    [cad, history, persist],
  );

  const undo = () => {
    const next = history.peekUndo();
    if (next) return transact(next, 'Muokkaus peruttu.', 'undo');
  };
  const redo = () => {
    const next = history.peekRedo();
    if (next) return transact(next, 'Muokkaus palautettu.', 'redo');
  };
  const cancel = () => {
    revision.current++;
    cad.cancel();
    setBusy(false);
    setReady(true);
    setMessage('Laskenta peruttiin. Edellinen malli säilyi.');
  };
  return {
    project,
    activity,
    setActionContext: (context: SelectionContext) => {
      actionContext.current = context;
    },
    meshes,
    cad,
    busy,
    ready,
    message,
    error,
    setError,
    setMessage,
    saveStatus,
    transact,
    undo,
    redo,
    canRestoreAction: (actionId: string) => !!history.beforeAction(actionId),
    restoreAction: async (actionId: string) => {
      const checkpoint = history.beforeAction(actionId);
      if (!checkpoint) {
        setError('Toiminto ei ole enää kumoamishistoriassa. Malli säilyi ennallaan.');
        return;
      }
      if (
        await transact(
          checkpoint.project,
          'Palattu leikkausta edeltävään malliin.',
          'restore',
          checkpoint.info,
        )
      )
        return history.current;
    },
    cancel,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    revision: () => revision.current,
  };
}
