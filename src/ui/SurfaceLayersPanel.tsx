import { useState } from 'react';
import { Eye, EyeOff, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { layerNames, type SurfaceLayer } from '../model/surfaceLayers';
import type { PaintScope as Scope } from '../model/faceMaterials';
import { PaintScope } from './PaintScope';
function NumberField({
  label,
  value,
  min = 0,
  max = 100000,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <label>
      {label}
      <input
        key={value}
        type="number"
        aria-label={label}
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (e.target.value && Number.isFinite(n) && n >= min && n <= max) {
            if (n !== value) onChange(n);
          } else e.target.value = String(value);
        }}
      />
    </label>
  );
}
export function SurfaceLayersPanel({
  name,
  layers,
  busy,
  kind,
  scope,
  placing,
  onKind,
  onScope,
  onAdd,
  onPlace,
  onMove,
  onChange,
  onDelete,
  onOrder,
  linked,
  onLinked,
  count,
}: {
  name?: string;
  layers: SurfaceLayer[];
  busy: boolean;
  kind: SurfaceLayer['kind'];
  scope: Scope;
  placing: boolean;
  onKind: (kind: SurfaceLayer['kind']) => void;
  onScope: (scope: Scope) => void;
  onAdd: () => void;
  onPlace: () => void;
  onMove: (id: string) => void;
  onChange: (id: string, patch: Partial<SurfaceLayer>) => void;
  onDelete: (id: string) => void;
  onOrder: (id: string, offset: number) => void;
  linked: boolean;
  onLinked: (linked: boolean) => void;
  count: number;
}) {
  const [opened, setOpened] = useState<string>();
  return (
    <section className="surface-layers-panel" aria-label="Pintakerrokset">
      <PaintScope value={scope} onChange={onScope} />
      <p className="layer-target">
        {name ?? 'Napsauta osaa tai pintaa'}
        {count > 1 && scope === 'body' ? ` · ${count} valittua osaa` : ''}
      </p>
      <label>
        Kerros
        <select
          aria-label="Lisättävä pintakerros"
          value={kind}
          onChange={(e) => onKind(e.target.value as SurfaceLayer['kind'])}
        >
          {Object.entries(layerNames).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="layer-add-actions">
        <button className="button outlined" disabled={busy || !name} onClick={onAdd}>
          Lisää kerros
        </button>
        <button
          className={`button ${placing ? 'primary' : 'outlined'}`}
          aria-pressed={placing}
          disabled={busy}
          onClick={onPlace}
        >
          {placing ? 'Napsauta jäljen paikkaa' : 'Aseta paikallinen jälki'}
        </button>
      </div>
      {placing && <small>Jälki rajautuu napsautettuun tasopintaan. Esc peruu asettelun.</small>}
      <div className="surface-layer-list">
        {layers.map((layer, index) => (
          <article
            key={layer.id}
            className="surface-layer-card"
            data-testid={`surface-layer-${layer.id}`}
          >
            <div className="surface-layer-row">
              <button
                className="icon-button"
                aria-label={`${layer.enabled ? 'Piilota' : 'Näytä'} kerros ${index + 1}`}
                disabled={busy}
                onClick={() => onChange(layer.id, { enabled: !layer.enabled })}
              >
                {layer.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                className="layer-name"
                aria-expanded={opened === layer.id}
                onClick={() => setOpened(opened === layer.id ? undefined : layer.id)}
              >
                {layerNames[layer.kind]}
                <small>
                  {layer.center ? 'Paikallinen jälki' : 'Koko pinta'} ·{' '}
                  {Math.round(layer.amount * 100)} %
                </small>
              </button>
              <button
                className="icon-button"
                aria-label={`Poista kerros ${index + 1}`}
                disabled={busy}
                onClick={() => onDelete(layer.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {(opened === layer.id || layers.length === 1) && (
              <div className="surface-layer-settings">
                <NumberField
                  label="Voimakkuus (%)"
                  value={Math.round(layer.amount * 100)}
                  max={100}
                  onChange={(n) => onChange(layer.id, { amount: n / 100 })}
                  disabled={busy}
                />
                <div className="layer-two-columns">
                  <NumberField
                    label="Leveys (mm)"
                    value={layer.width}
                    min={1}
                    onChange={(n) => onChange(layer.id, { width: n })}
                    disabled={busy}
                  />
                  <NumberField
                    label="Korkeus (mm)"
                    value={layer.height}
                    min={1}
                    onChange={(n) => onChange(layer.id, { height: n })}
                    disabled={busy}
                  />
                </div>
                <NumberField
                  label="Kierto (°)"
                  value={layer.rotation}
                  min={-360000}
                  max={360000}
                  onChange={(n) => onChange(layer.id, { rotation: n })}
                  disabled={busy}
                />
                <label>
                  Sävy
                  <input
                    aria-label="Pintakerroksen sävy"
                    type="color"
                    key={layer.color}
                    defaultValue={layer.color}
                    disabled={busy}
                    onInput={(e) => {
                      e.currentTarget.dataset.draft = e.currentTarget.value;
                    }}
                    onBlur={(e) => {
                      if (e.currentTarget.value !== layer.color)
                        onChange(layer.id, { color: e.currentTarget.value });
                    }}
                    onChange={(e) => {
                      e.currentTarget.dataset.draft = e.currentTarget.value;
                    }}
                  />
                </label>
                {layer.center && (
                  <>
                    <div className="layer-two-columns">
                      <NumberField
                        label="Paikka U (mm)"
                        value={Math.round(layer.center[0] * 100) / 100}
                        min={-1000000}
                        max={1000000}
                        step={0.1}
                        onChange={(n) => onChange(layer.id, { center: [n, layer.center![1]] })}
                        disabled={busy}
                      />
                      <NumberField
                        label="Paikka V (mm)"
                        value={Math.round(layer.center[1] * 100) / 100}
                        min={-1000000}
                        max={1000000}
                        step={0.1}
                        onChange={(n) => onChange(layer.id, { center: [layer.center![0], n] })}
                        disabled={busy}
                      />
                    </div>
                    <button
                      className="button outlined full"
                      disabled={busy}
                      onClick={() => onMove(layer.id)}
                    >
                      Siirrä jälkeä pinnalla
                    </button>
                  </>
                )}
                <div className="layer-order-actions">
                  <button
                    className="button subtle"
                    disabled={busy || index === 0}
                    onClick={() => onOrder(layer.id, -1)}
                  >
                    <ArrowUp size={14} />
                    Aiemmaksi
                  </button>
                  <button
                    className="button subtle"
                    disabled={busy || index === layers.length - 1}
                    onClick={() => onOrder(layer.id, 1)}
                  >
                    <ArrowDown size={14} />
                    Myöhemmäksi
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {!layers.length && (
        <small>Pohjamateriaali säilyy. Kerrokset voi piilottaa ja poistaa erikseen.</small>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={linked} onChange={(e) => onLinked(e.target.checked)} />
        Jaa linkitettyihin kopioihin
      </label>
    </section>
  );
}
