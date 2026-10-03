import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize } from 'lucide-react';
import type { Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { assemblyParts, explodeParts, partRows, partsCSV } from '../model/parts';
import { createRenderScene, renderDefaults } from '../render/scene';
import { downloadFile, safeFilename } from '../storage/projects';
import { formatLength } from '../model/units';
import { groupPath } from '../model/groups';
import type { CutSettings } from '../model/cutSettings';
import { CutWorkspace } from './CutWorkspace';

export function PartsWorkspace({
  project,
  meshes,
  selectedGroupId,
  onCutSettings,
}: {
  project: Project;
  meshes: BodyMesh[];
  selectedGroupId?: string;
  onCutSettings: (settings: CutSettings) => Promise<boolean>;
}) {
  const [target, setTarget] = useState(selectedGroupId ?? 'all');
  const [tab, setTab] = useState<'exploded' | 'cutting'>('exploded');
  const bodies = useMemo(() => assemblyParts(project, target), [project, target]);
  useEffect(() => {
    if (target !== 'all' && !project.groups.some((g) => g.id === target)) setTarget('all');
  }, [target, project.groups]);
  const title =
    target === 'all' ? project.name : `${project.name} / ${groupPath(project.groups, target)}`;
  return (
    <section
      className="parts-workspace"
      aria-label="Osaluettelo, räjäytyskuva ja leikkauslista"
      data-cutting={tab === 'cutting'}
    >
      <div className="parts-workspace-toolbar">
        <div className="parts-tabs" aria-label="Osien esitystapa">
          <button aria-pressed={tab === 'exploded'} onClick={() => setTab('exploded')}>
            Räjäytyskuva
          </button>
          <button aria-pressed={tab === 'cutting'} onClick={() => setTab('cutting')}>
            Leikkauslista
          </button>
        </div>
        <label>
          Kokoonpano
          <select
            aria-label="Osaluettelon kohde"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="all">Koko malli</option>
            {project.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupPath(project.groups, g.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tab === 'exploded' ? (
        <ExplodedParts project={project} meshes={meshes} target={target} />
      ) : (
        <CutWorkspace
          project={project}
          bodies={bodies}
          meshes={meshes}
          title={title}
          onSettings={onCutSettings}
        />
      )}
    </section>
  );
}

function ExplodedParts({
  project,
  meshes,
  target,
}: {
  project: Project;
  meshes: BodyMesh[];
  target: string;
}) {
  const [amount, setAmount] = useState(0.8);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof createRenderScene>>(undefined);
  const bodies = useMemo(() => assemblyParts(project, target), [project, target]);
  const exploded = useMemo(() => explodeParts(bodies, meshes, amount), [bodies, meshes, amount]);
  const rows = useMemo(() => partRows(project, bodies), [project, bodies]);
  const current = useRef<Parameters<typeof createRenderScene>[1] extends () => infer P ? P : never>(
    null!,
  );
  current.current = {
    ...exploded,
    bodies: exploded.bodies.map((b) =>
      selected === b.id ? { ...b, color: '#9bc788', appearance: undefined, material: 'matte' } : b,
    ),
    settings: renderDefaults,
    onPick: setSelected,
    selectedIds: selected ? [selected] : [],
    assets: project.assets,
    onTexture: () => {},
    partNumbers: Object.fromEntries(rows.map((r) => [r.id, r.number])),
  };
  useEffect(() => {
    try {
      api.current = createRenderScene(host.current!, () => current.current);
      api.current.sync();
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      api.current?.dispose();
      api.current = undefined;
    };
  }, []);
  useEffect(() => {
    api.current?.sync();
  }, [exploded, selected]);
  useEffect(() => {
    api.current?.fit();
  }, [target]);
  const exportImage = async () => {
    setExporting(true);
    setError('');
    try {
      const blob = await api.current?.exportPNG(2400);
      if (blob) downloadFile(blob, `${safeFilename(project.name)}-rajaytyskuva.png`, 'image/png');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="parts-layout">
      <div className="parts-preview">
        <div ref={host} className="parts-canvas" />
        <div className="parts-view-controls">
          <label>
            Räjäytyskuva{' '}
            <input
              aria-label="Räjäytyksen määrä"
              type="range"
              min="0"
              max="2"
              step="0.02"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <button className="button outlined" onClick={() => setAmount(0)}>
            Koottu
          </button>
          <button className="button outlined" onClick={() => api.current?.fit()}>
            <Maximize size={16} />
            Sovita malli
          </button>
        </div>
        <p className="parts-caption">
          Numerot vastaavat osaluetteloa. Klikkaa osaa tunnistaaksesi sen.
        </p>
      </div>
      <aside className="parts-list-panel">
        <h2>
          Osaluettelo <small>{rows.length} osaa</small>
        </h2>
        <p className="muted">
          Jokainen erillinen malliosa on yksi osa. Myös piilotetut osat sisältyvät luetteloon.
        </p>
        <div className="parts-table-scroll">
          <table className="parts-table">
            <thead>
              <tr>
                <th>Nro</th>
                <th>Osa / ulkomitat X × Y × Z</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-selected={selected === row.id}>
                  <td>{row.number}</td>
                  <td>
                    <button
                      aria-label={`Näytä osa: ${row.name}`}
                      onClick={() => setSelected(row.id)}
                    >
                      <strong>{row.name}</strong>
                      <span>
                        {[row.width, row.depth, row.height].map(formatLength).join(' × ')} mm
                      </span>
                      <small>{[row.group, row.material].filter(Boolean).join(' · ')}</small>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>Ei erillisiä kiinteitä malliosia.</p>}
        </div>
        <p className="parts-note">
          Leikkauslista-välilehti sijoittelee erilliset levyosat sahauslevyille. Yhtenäiseksi
          mallinnettu kaappirunko on yhä yksi osa; tarvittaessa luo erilliset levyt
          Levyrunko-työkalulla.
        </p>
        <button
          className="button dark full"
          disabled={!rows.length}
          onClick={() =>
            downloadFile(
              partsCSV(project, bodies),
              `${safeFilename(project.name)}-osaluettelo.csv`,
              'text/csv;charset=utf-8',
            )
          }
        >
          <Download size={16} />
          Vie osaluettelo CSV
        </button>
        <button
          className="button outlined full"
          disabled={!rows.length || exporting}
          onClick={() => void exportImage()}
        >
          {exporting ? 'Tallennetaan…' : 'Tallenna räjäytyskuva PNG'}
        </button>
        {error && <p role="alert">{error}</p>}
      </aside>
    </div>
  );
}
