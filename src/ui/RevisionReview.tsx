import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileInput, Save, Scan, Trash2, X, GitCompareArrows } from 'lucide-react';
import { SelectionDialog } from './SelectionDialog';
import { RevisionScene, type RevisionMesh } from './RevisionScene';
import {
  compareProjects,
  changeColors,
  changeLabels,
  revisionCsv,
  type ChangeKind,
} from '../model/revisions';
import { parseProject, type Project } from '../model/project';
import { CadClient } from '../cad/client';
import { bodyMeshKey } from '../cad/meshKey';
import type { BodyMesh } from '../cad/protocol';
import {
  listRevisions,
  saveRevision,
  readRevision,
  deleteRevision,
  type RevisionEntry,
} from '../storage/revisions';
import { downloadFile, safeFilename } from '../storage/projects';

export default function RevisionReview({
  project,
  meshes,
  onClose,
}: {
  project: Project;
  meshes: BodyMesh[];
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [baseline, setBaseline] = useState<{ project: Project; name: string; id?: string }>();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [focus, setFocus] = useState(0);
  const [filter, setFilter] = useState<ChangeKind | 'all'>('all');
  const [oldPositions, setOldPositions] = useState(true);
  const [oldMeshes, setOldMeshes] = useState<BodyMesh[]>([]);
  const [building, setBuilding] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const changes = useMemo(
    () => (baseline ? compareProjects(baseline.project, project) : []),
    [baseline, project],
  );
  const index = useMemo(() => new Map(changes.map((c) => [c.id, c])), [changes]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    let active = true;
    void listRevisions(project.id)
      .then(async (next) => {
        if (!active) return;
        setEntries(next);
        if (next[0]) {
          const p = await readRevision(next[0].id);
          if (active) setBaseline({ project: p, name: next[0].name, id: next[0].id });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project.id]);
  useEffect(() => {
    const cad = new CadClient();
    let active = true;
    const id = ++generation.current;
    const previous = changes
      .filter(
        (c) =>
          c.before &&
          (c.kind === 'removed' ||
            (oldPositions && bodyMeshKey(c.before) !== bodyMeshKey(c.after!))),
      )
      .map((c) => c.before!);
    setOldMeshes([]);
    setBuilding(!!previous.length);
    if (previous.length)
      void cad
        .build(previous)
        .then((m) => {
          if (active && id === generation.current) setOldMeshes(m);
        })
        .catch((e) => {
          if (active) setError(`Vanhan geometrian esitys: ${e.message}`);
        })
        .finally(() => {
          if (active) setBuilding(false);
        });
    return () => {
      active = false;
      cad.cancel();
    };
  }, [changes, oldPositions]);
  const items = useMemo<RevisionMesh[]>(
    () => [
      ...meshes
        .map((mesh) => ({ mesh, id: mesh.id, kind: index.get(mesh.id)?.kind }))
        .filter((m) => filter === 'all' || m.kind === filter),
      ...oldMeshes
        .map((mesh) => ({ mesh, id: mesh.id, kind: index.get(mesh.id)?.kind, ghost: true }))
        .filter((m) => filter === 'all' || m.kind === filter),
    ],
    [meshes, oldMeshes, index, filter],
  );
  const visible = changes.filter((c) => filter === 'all' || c.kind === filter);
  const counts = (kind: ChangeKind) => changes.filter((c) => c.kind === kind).length;
  const shared = useMemo(() => {
    const ids = new Set(project.bodies.map((b) => b.id));
    return baseline?.project.bodies.some((b) => ids.has(b.id));
  }, [baseline, project.bodies]);
  return (
    <SelectionDialog title="Projektin muutokset" onClose={onClose}>
      <div className="revision-review">
        <div className="revision-heading">
          <span>
            <GitCompareArrows size={17} /> {project.name}
          </span>
          <button className="icon-button" aria-label="Sulje vertailu" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="revision-source">
          <label>
            Vertaa versioon
            <select
              aria-label="Vertailuversio"
              disabled={working}
              value={baseline?.id ?? ''}
              onChange={(e) => {
                const entry = entries.find((r) => r.id === e.target.value);
                if (entry)
                  void run(async () => {
                    setSelected(undefined);
                    setBaseline({
                      project: await readRevision(entry.id),
                      name: entry.name,
                      id: entry.id,
                    });
                  });
              }}
            >
              <option value="">
                {baseline && !baseline.id ? baseline.name : 'Valitse vertailuversio'}
              </option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {new Date(e.createdAt).toLocaleDateString('fi-FI')}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button outlined"
            disabled={working}
            onClick={() => file.current?.click()}
          >
            <FileInput size={16} />
            Aiempi .nivo-tiedosto
          </button>
          <input
            ref={file}
            type="file"
            accept=".nivo,application/json"
            hidden
            aria-label="Aiempi projektiversio"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f)
                void run(async () => {
                  const p = parseProject(await f.text());
                  setBaseline({ project: p, name: f.name });
                  setSelected(undefined);
                });
            }}
          />
          <details className="revision-save">
            <summary>Tallenna nykyinen versio</summary>
            <div>
              <label>
                Version nimi
                <input
                  aria-label="Version nimi"
                  maxLength={120}
                  value={name}
                  placeholder={`Versio ${entries.length + 1}`}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="button dark"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    const entry = await saveRevision(
                      project,
                      name || `Versio ${entries.length + 1}`,
                    );
                    setEntries(await listRevisions(project.id));
                    setBaseline({ project, name: entry.name, id: entry.id });
                    setName('');
                  })
                }
              >
                <Save size={15} />
                Tallenna vertailuversio
              </button>
              <p className="muted">
                Nimetyt versiot säilyvät tässä selaimessa. Lataa .nivo-tiedosto mukaan toiselle
                laitteelle.
              </p>
            </div>
          </details>
        </div>
        {error && (
          <p role="alert" className="drawing-warning">
            {error}
          </p>
        )}
        {baseline ? (
          <>
            <div className="revision-legend" aria-label="Muutosten selitteet">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                Kaikki ({changes.length})
              </button>
              {(['added', 'removed', 'modified'] as const).map((kind) => (
                <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
                  <i style={{ background: changeColors[kind] }} />
                  {changeLabels[kind]} ({counts(kind)})
                </button>
              ))}
              <button
                onClick={() => {
                  setSelected(undefined);
                  setFocus((n) => n + 1);
                }}
              >
                <Scan size={15} />
                Sovita
              </button>
            </div>
            {!shared && baseline.project.bodies.length > 0 && project.bodies.length > 0 && (
              <p className="muted">
                Malleissa ei ole yhteisiä osatunnisteita. Osat näkyvät poistoina ja lisäyksinä;
                nimien perusteella niitä ei yhdistetä.
              </p>
            )}
            <div className="revision-content">
              <div className="revision-visual">
                <RevisionScene
                  items={items}
                  selected={selected}
                  focus={focus}
                  onSelect={setSelected}
                />
                {building && (
                  <p className="revision-loading" role="status">
                    Valmistellaan aiempaa geometriaa…
                  </p>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={oldPositions}
                    onChange={(e) => setOldPositions(e.target.checked)}
                  />
                  Näytä muokattujen osien aiempi muoto haamuna
                </label>
              </div>
              <div className="revision-list" aria-label="Muutosluettelo">
                <div className="revision-list-heading">
                  <strong>{baseline.name} → nykyinen</strong>
                  <small>{new Date(baseline.project.updatedAt).toLocaleString('fi-FI')}</small>
                </div>
                {visible.map((c) => (
                  <button
                    key={c.id}
                    className={selected === c.id ? 'is-selected' : ''}
                    data-change={c.kind}
                    onClick={() => {
                      setSelected(c.id);
                      setFocus((n) => n + 1);
                    }}
                  >
                    <span className="revision-number" style={{ color: changeColors[c.kind] }}>
                      {String(c.number).padStart(2, '0')}
                    </span>
                    <span>
                      <strong>{(c.after ?? c.before)!.name}</strong>
                      <small>
                        {changeLabels[c.kind]} · {c.details.join(', ')}
                      </small>
                    </span>
                  </button>
                ))}
                {!visible.length && (
                  <p className="muted">
                    {changes.length
                      ? 'Ei tämän tyypin muutoksia.'
                      : 'Ei osamuutoksia vertailuversioon nähden.'}
                  </p>
                )}
              </div>
            </div>
            <div className="revision-footer">
              <button
                className="button outlined"
                onClick={() =>
                  downloadFile(
                    revisionCsv(changes, baseline.name, project.name),
                    `${safeFilename(project.name)}-muutosluettelo.csv`,
                    'text/csv;charset=utf-8',
                  )
                }
              >
                <Download size={15} />
                Vie muutosluettelo
              </button>
              <button
                className="button subtle"
                onClick={() =>
                  downloadFile(
                    JSON.stringify(baseline.project),
                    `${safeFilename(baseline.name)}.nivo`,
                    'application/json',
                  )
                }
              >
                Lataa vertailuversio
              </button>
              {baseline.id &&
                (removing === baseline.id ? (
                  <>
                    <span>Poistetaanko tallennettu versio?</span>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await deleteRevision(baseline.id!);
                          setEntries(await listRevisions(project.id));
                          setBaseline(undefined);
                          setRemoving(undefined);
                        })
                      }
                    >
                      Poista versio
                    </button>
                    <button onClick={() => setRemoving(undefined)}>Peru</button>
                  </>
                ) : (
                  <button
                    className="icon-button"
                    aria-label="Poista tallennettu versio"
                    onClick={() => setRemoving(baseline.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                ))}
            </div>
          </>
        ) : (
          <div className="revision-empty">
            <GitCompareArrows size={36} />
            <h3>Mikä muuttui edellisestä versiosta?</h3>
            <p>
              Avaa aiempi .nivo-tiedosto tai tallenna nykyinen malli vertailuversioksi ennen
              seuraavia muutoksia.
            </p>
            <p className="muted">
              Lisäykset näkyvät vihreinä, poistot punaisina haamuina ja muokatut osat meripihkan
              värisinä. Vertailu ei muuta malliasi.
            </p>
          </div>
        )}
      </div>
    </SelectionDialog>
  );
}
