import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Maximize } from 'lucide-react';
import type { BodyMesh } from '../cad/protocol';
import type { Body } from '../model/project';
import { CommitCheckbox } from '../ui/CommitCheckbox';
import { BodyColor } from '../ui/BodyColor';
import { downloadFile, safeFilename } from '../storage/projects';
import { createRenderScene, materialNames, type RenderSettings } from './scene';

type Props = {
  bodies: Body[];
  meshes: BodyMesh[];
  selectedIds: string[];
  settings: RenderSettings;
  name: string;
  busy: boolean;
  error: string;
  onMaterial: (ids: string[], material: NonNullable<Body['material']>) => void;
  onColor: (ids: string[], color: string) => void;
  onSettings: (settings: RenderSettings) => Promise<unknown>;
  onClose: () => void;
};

export function RenderStage(props: Props) {
  const { bodies, meshes, settings, selectedIds, busy } = props;
  const [target, setTarget] = useState(
    selectedIds.some((id) => bodies.some((b) => b.id === id)) ? 'selection' : 'all',
  );
  const [exposure, setExposure] = useState(settings.exposure);
  const [width, setWidth] = useState(2400);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof createRenderScene>>(undefined);
  const latest = useRef({ bodies, meshes, settings, onPick: setTarget });
  latest.current = { bodies, meshes, settings: { ...settings, exposure }, onPick: setTarget };
  useEffect(() => {
    try {
      api.current = createRenderScene(host.current!, () => latest.current);
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
  }, [bodies, meshes]);
  useEffect(() => setExposure(settings.exposure), [settings.exposure]);
  useEffect(() => {
    api.current?.settings();
  }, [settings, exposure]);
  useEffect(() => {
    if (
      target !== 'all' &&
      !bodies.some((b) => (target === 'selection' ? selectedIds.includes(b.id) : b.id === target))
    )
      setTarget('all');
  }, [bodies, target, selectedIds]);
  const targets = bodies.filter(
    (b) =>
      target === 'all' || (target === 'selection' ? selectedIds.includes(b.id) : b.id === target),
  );
  const ids = targets.map((b) => b.id);
  const material = targets[0]?.material ?? 'matte';
  const mixed = targets.some((b) => (b.material ?? 'matte') !== material);
  const color = targets[0]?.color ?? '#d8c8a7';
  const exportImage = async () => {
    if (!api.current) return;
    setExporting(true);
    setError('');
    try {
      const blob = await api.current.exportPNG(width);
      downloadFile(blob, `${safeFilename(props.name)}.png`, 'image/png');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const commitExposure = () => {
    if (!busy && exposure !== settings.exposure) props.onSettings({ ...settings, exposure });
  };
  return (
    <section className="render-workspace" aria-label="Renderöinti">
      <div className="render-view">
        <div ref={host} className="render-host" />
        <div className="render-toolbar">
          <button className="button subtle" onClick={props.onClose}>
            <ArrowLeft size={16} />
            Takaisin malliin
          </button>
          <button
            className="button subtle"
            onClick={() => api.current?.fit()}
            disabled={!bodies.length}
          >
            <Maximize size={16} />
            Sovita malli
          </button>
        </div>
        {!bodies.length && (
          <div className="render-empty">Ei näkyviä malliosia. Näytä osat kappalelistasta.</div>
        )}
        <p className="render-caption">
          Vedä kiertääksesi · rulla zoomaa · klikkaa osaa valitaksesi sen materiaalin
        </p>
      </div>
      <aside className="render-panel" aria-label="Renderöinnin asetukset">
        <span className="eyebrow">ESITYSKUVA</span>
        <h2>Materiaalit ja valo</h2>
        <label>
          Käsiteltävät osat
          <select
            aria-label="Materiaalin kohde"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="all">Kaikki näkyvät osat ({bodies.length})</option>
            {selectedIds.some((id) => bodies.some((b) => b.id === id)) && (
              <option value="selection">
                Mallin valinta ({bodies.filter((b) => selectedIds.includes(b.id)).length})
              </option>
            )}
            {bodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Materiaali
          <select
            aria-label="Materiaali"
            disabled={busy || !ids.length}
            value={mixed ? '' : material}
            onChange={(e) => props.onMaterial(ids, e.target.value as NonNullable<Body['material']>)}
          >
            {mixed && (
              <option value="" disabled>
                Useita materiaaleja
              </option>
            )}
            {Object.entries(materialNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <BodyColor
          color={color}
          mixed={targets.some((b) => b.color !== color)}
          busy={busy || !ids.length}
          onChange={(value) => props.onColor(ids, value)}
        />
        <hr />
        <label>
          Valaistus
          <select
            aria-label="Valaistus"
            value={settings.environment}
            disabled={busy}
            onChange={(e) =>
              props.onSettings({
                ...settings,
                environment: e.target.value as RenderSettings['environment'],
              })
            }
          >
            <option value="studio">Studio</option>
            <option value="warm">Lämmin</option>
            <option value="dark">Tumma</option>
          </select>
        </label>
        <label>
          Valotus <output>{exposure.toFixed(1)}</output>
          <input
            aria-label="Valotus"
            type="range"
            min="0.3"
            max="2.5"
            step="0.1"
            value={exposure}
            disabled={busy}
            onChange={(e) => setExposure(Number(e.target.value))}
            onPointerUp={commitExposure}
            onKeyUp={commitExposure}
            onBlur={commitExposure}
          />
        </label>
        <label className="render-check">
          <CommitCheckbox
            label="Varjot"
            checked={settings.shadows}
            disabled={busy}
            onChange={(shadows) => props.onSettings({ ...settings, shadows })}
          />
          Varjot
        </label>
        <hr />
        <label>
          Kuvan leveys
          <select
            aria-label="Kuvan leveys"
            value={width}
            disabled={exporting}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            <option value={1600}>1 600 px</option>
            <option value={2400}>2 400 px</option>
          </select>
        </label>
        <button
          className="button primary full"
          disabled={busy || exporting || !bodies.length}
          onClick={() => void exportImage()}
        >
          <Download size={16} />
          {exporting ? 'Tallennetaan kuvaa…' : 'Tallenna PNG'}
        </button>
        <p className="render-note">
          Kuva seuraa nykyistä kuvakulmaa. Rakennusmuodot, apuviivat ja valintakorostukset jäävät
          pois.
        </p>
        {(error || props.error) && (
          <p role="alert" className="render-error">
            {error || props.error}
          </p>
        )}
      </aside>
    </section>
  );
}
