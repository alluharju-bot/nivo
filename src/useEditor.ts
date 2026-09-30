import { useCallback, useEffect, useRef, useState } from 'react';
import { CadClient } from './cad/client';
import type { BodyMesh } from './cad/protocol';
import { freshProject, projectSchema, type Project } from './model/project';
import { History } from './model/history';
import { loadLocal, saveLocal } from './storage/projects';

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
  const revision = useRef(0);
  const saveRevision = useRef(0);

  const persist = useCallback((next: Project) => {
    const r = ++saveRevision.current;
    setSaveStatus('Tallennetaan…');
    void saveLocal(next)
      .then(() => {
        if (r === saveRevision.current) setSaveStatus('Tallessa selaimessa');
      })
      .catch((e: Error) => {
        if (r === saveRevision.current) {
          setSaveStatus('Tallennus epäonnistui');
          setError(e.message);
        }
      });
  }, []);

  useEffect(() => {
    const current = ++revision.current;
    void (async () => {
      try {
        const restored = await loadLocal();
        const initial = restored ?? history.current;
        const built = await cad.build(initial.bodies);
        if (current !== revision.current) return;
        history.current = initial;
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
    async (candidate: Project, label: string, mode: 'commit' | 'undo' | 'redo' = 'commit') => {
      const current = ++revision.current;
      setBusy(true);
      setError('');
      setMessage('Lasketaan tarkkaa geometriaa…');
      try {
        const validated = projectSchema.safeParse({
          ...candidate,
          updatedAt: new Date().toISOString(),
        });
        if (!validated.success)
          throw new Error(
            'Mitat tai sijainti eivät ole sallituissa rajoissa. Tarkista syöte; enimmäismitta ja sijainti ovat 100 000 mm.',
          );
        const next = validated.data;
        const built = await cad.build(next.bodies);
        if (current !== revision.current) return false;
        if (mode === 'undo') history.undo();
        else if (mode === 'redo') history.redo();
        else history.commit(next);
        history.current = next;
        setProject(next);
        setMeshes(built);
        setMessage(label);
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
