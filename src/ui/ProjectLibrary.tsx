import { useEffect, useState } from 'react';
import { Box, Copy, Download, FolderOpen, Plus, Search, Trash2, X } from 'lucide-react';
import { SelectionDialog } from './SelectionDialog';
import { InlineName } from './InlineName';
import { History } from '../model/history';
import { uid, type Project } from '../model/project';
import {
  deleteLocalProject,
  downloadFile,
  listLocalProjects,
  loadLocalSession,
  safeFilename,
  saveLocal,
  type LibraryEntry,
  type LocalSession,
} from '../storage/projects';

export function ProjectLibrary({
  activeId,
  revision,
  onOpen,
  onAdd,
  onNew,
  onRenameActive,
  onImport,
  onClose,
}: {
  activeId: string;
  revision: number;
  onOpen: (session: LocalSession) => Promise<boolean>;
  onAdd: (project: Project) => Promise<boolean>;
  onNew: () => Promise<void>;
  onRenameActive: (name: string) => Promise<void>;
  onImport: (mode: 'open' | 'add') => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [tab, setTab] = useState<'project' | 'part'>('project');
  const [query, setQuery] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string>();
  const refresh = async () => setEntries(await listLocalProjects());
  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, [revision]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const read = async (id: string) => {
    // Reading/downloading the active card must not authorize stale editor data
    // to overwrite a newer save from another tab.
    const saved = await loadLocalSession(id, id !== activeId);
    if (!saved) throw new Error('Tallennetta ei löytynyt. Päivitä kirjasto.');
    return saved;
  };
  return (
    <SelectionDialog
      title="Projektikirjasto"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <div className="library-heading">
        <span>Tallessa tässä selaimessa</span>
        <button aria-label="Sulje kirjasto" disabled={working} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="library-toolbar">
        <button className="button dark" disabled={working} onClick={() => void run(onNew)}>
          <Plus size={16} /> Uusi projekti
        </button>
        <button disabled={working} onClick={() => onImport('open')}>
          <FolderOpen size={16} /> Avaa tiedosto
        </button>
        <button disabled={working} onClick={() => onImport('add')}>
          <Plus size={16} /> Lisää malliin
        </button>
      </div>
      <div className="library-filters">
        <div className="mode-switch" aria-label="Kirjaston sisältö">
          <button aria-pressed={tab === 'project'} onClick={() => setTab('project')}>
            Projektit
          </button>
          <button aria-pressed={tab === 'part'} onClick={() => setTab('part')}>
            Omat osat
          </button>
        </div>
        <label>
          <Search size={15} />
          <input
            aria-label="Hae kirjastosta"
            placeholder="Hae nimellä"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="library-grid" aria-busy={working}>
        {entries
          .filter(
            (e) =>
              e.kind === tab &&
              e.name.toLocaleLowerCase('fi').includes(query.toLocaleLowerCase('fi')),
          )
          .map((entry) => (
            <article className="library-card" key={entry.id} data-active={entry.id === activeId}>
              <div className="library-preview">
                {entry.thumbnail ? <img src={entry.thumbnail} alt="" /> : <Box size={44} />}
              </div>
              <InlineName
                name={entry.name}
                label={`Nimeä ${entry.name}`}
                disabled={working}
                onChange={(name) =>
                  void run(async () => {
                    if (entry.id === activeId) {
                      await onRenameActive(name);
                      return;
                    }
                    const session = await read(entry.id),
                      history = new History(session.project);
                    history.restore(session.history);
                    history.commit({
                      ...session.project,
                      name,
                      updatedAt: new Date().toISOString(),
                    });
                    await saveLocal(history.current, history.serialize(), { activate: false });
                  })
                }
              />
              <small>
                {entry.parts} osaa · {new Date(entry.updatedAt).toLocaleDateString('fi-FI')}
                {entry.id === activeId ? ' · Avoinna' : ''}
              </small>
              <div className="library-card-actions">
                {tab === 'project' && (
                  <button
                    disabled={working || entry.id === activeId}
                    onClick={() =>
                      void run(async () => {
                        if (await onOpen(await read(entry.id))) onClose();
                      })
                    }
                  >
                    Avaa
                  </button>
                )}
                <button
                  disabled={working || !entry.parts}
                  onClick={() =>
                    void run(async () => {
                      if (await onAdd((await read(entry.id)).project)) onClose();
                    })
                  }
                >
                  Lisää malliin
                </button>
                <button
                  title="Monista"
                  aria-label={`Monista ${entry.name}`}
                  disabled={working}
                  onClick={() =>
                    void run(async () => {
                      const { project } = await read(entry.id);
                      await saveLocal(
                        {
                          ...project,
                          id: uid(),
                          name: `${project.name.slice(0, 105)} (kopio)`,
                          updatedAt: new Date().toISOString(),
                        },
                        undefined,
                        { kind: entry.kind, thumbnail: entry.thumbnail, activate: false },
                      );
                    })
                  }
                >
                  <Copy size={15} />
                </button>
                <button
                  title="Lataa tiedosto"
                  aria-label={`Lataa ${entry.name}`}
                  disabled={working}
                  onClick={() =>
                    void run(async () => {
                      const { project } = await read(entry.id);
                      downloadFile(
                        JSON.stringify(project),
                        `${safeFilename(project.name)}.nivo`,
                        'application/json',
                      );
                    })
                  }
                >
                  <Download size={15} />
                </button>
                <button
                  title="Poista"
                  aria-label={`Poista ${entry.name}`}
                  disabled={working || entry.id === activeId}
                  onClick={() => setRemoving(entry.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {removing === entry.id && (
                <div className="library-delete">
                  <span>Poistetaanko selaimesta?</span>
                  <button
                    disabled={working}
                    onClick={() =>
                      void run(async () => {
                        await deleteLocalProject(entry.id);
                        setRemoving(undefined);
                      })
                    }
                  >
                    Poista
                  </button>
                  <button onClick={() => setRemoving(undefined)}>Peruuta</button>
                </div>
              )}
            </article>
          ))}
        {!entries.some((e) => e.kind === tab) && (
          <p className="muted">
            {tab === 'part'
              ? 'Valitse osat mallista ja valitse Tallenna valinta kirjastoon.'
              : 'Tallennetut projektit näkyvät täällä.'}
          </p>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </SelectionDialog>
  );
}
