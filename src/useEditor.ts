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
import type { Activity, SelectionContext } from './model/activity';
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
      mode: 'commit' | 'replace' | 'undo' | 'redo' = 'commit',
    ) => {
      const current = ++revision.current;
      const info =
        mode === 'undo' ? history.undoInfo : mode === 'redo' ? history.redoInfo : undefined;
      const context = mode === 'replace' ? { ids: [] } : (info?.context ?? actionContext.current);
      setBusy(true);
      setError('');
      setMessage('Lasketaan tarkkaa geometriaa…');
      try {
        let resolved = typeof candidate === 'function' ? await candidate() : candidate;
        if (current !== revision.current) return false;
        if (mode === 'commit')
          resolved = await synchronizeComponents(history.current, resolved, (source, targets) =>
            cad.instances(source, targets),
          );
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
        const built = await cad.build(next.bodies);
        if (current !== revision.current) return false;
        if (mode === 'undo') history.undo();
        else if (mode === 'redo') history.redo();
        else history.commit(next, { label, context });
        history.adopt(next);
        setProject(next);
        setMeshes(built);
        setMessage(label);
        setActivity({
          id: uid(),
          projectId: next.id,
          at: Date.now(),
          context,
          kind: mode === 'undo' ? 'undo' : mode === 'redo' ? 'redo' : 'edit',
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
    cancel,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  };
}
