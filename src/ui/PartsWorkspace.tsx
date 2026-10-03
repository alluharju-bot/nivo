import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize } from 'lucide-react';
import type { Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { assemblyParts, explodeParts, partRows, partsCSV } from '../model/parts';
import { createRenderScene, renderDefaults } from '../render/scene';
import { downloadFile, safeFilename } from '../storage/projects';
import { formatLength } from '../model/units';

export function PartsWorkspace({
  project,
  meshes,
  selectedGroupId,
}: {
  project: Project;
  meshes: BodyMesh[];
  selectedGroupId?: string;
}) {
  const [target, setTarget] = useState(selectedGroupId ?? 'all');
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
  useEffect(() => {
    if (target !== 'all' && !project.groups.some((g) => g.id === target)) setTarget('all');
  }, [target, project.groups]);
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
    <section className="parts-workspace" aria-label="Osaluettelo ja räjäytyskuva">
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
        <label>
          Kokoonpano
          <select
            aria-label="Osaluettelon kohde"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setSelected(undefined);
            }}
          >
            <option value="all">Koko malli</option>
            {project.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
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
          Ulkomitat eivät ole sahauslista. Yhtenäiseksi mallinnettu kaappirunko näkyy yhtenä osana;
          levyjaon ja liitosten valinta tarvitaan ennen sen pilkkomista.
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
    </section>
  );
}
