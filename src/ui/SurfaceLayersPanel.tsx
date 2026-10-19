import { DecalEditor } from './DecalEditor';
import { defaultDecal } from '../model/decals';
import type { TextureAsset } from '../model/materials';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { layerNames, type SurfaceLayer } from '../model/surfaceLayers';
import type { PaintScope as Scope } from '../model/faceMaterials';
import { PaintScope } from './PaintScope';
import { materialPresets, findPreset } from '../model/materials';
function LayerColor({
  layer,
  busy,
  onChange,
}: {
  layer: SurfaceLayer;
  busy: boolean;
  onChange: (id: string, patch: Partial<SurfaceLayer>) => void;
}) {
  return (
    <label>
      {layer.kind === 'paint' ? 'Maalin sävy' : 'Sävy'}
      <input
        aria-label={layer.kind === 'paint' ? 'Maalin sävy' : 'Pintakerroksen sävy'}
        type="color"
        key={layer.color}
        defaultValue={layer.color}
        disabled={busy}
        onBlur={(e) => {
          if (e.currentTarget.value !== layer.color)
            onChange(layer.id, { color: e.currentTarget.value });
        }}
      />
    </label>
  );
}
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
  basePreset,
  onBase,
  draft,
  onDraft,
  assets,
  onAsset,
  brush,
  onBrush,
}: {
  draft: SurfaceLayer;
  onDraft: (layer: SurfaceLayer) => void;
  assets: Record<string, TextureAsset>;
  onAsset: (id: string, asset: TextureAsset) => void;
  brush: { layerId?: string; radius: number; strength: number; hardness: number; erase: boolean };
  onBrush: (brush: {
    layerId?: string;
    radius: number;
    strength: number;
    hardness: number;
    erase: boolean;
  }) => void;
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
  basePreset?: string;
  onBase: (preset: string) => void;
}) {
  const [opened, setOpened] = useState<string>();
  const [draftOpen, setDraftOpen] = useState(!layers.some((l) => l.kind === 'decal'));
  const layerCount = useRef(layers.length);
  useEffect(() => {
    if (layers.length > layerCount.current && layers.at(-1)?.kind === 'decal') {
      setDraftOpen(false);
      setOpened(layers.at(-1)!.id);
    }
    layerCount.current = layers.length;
  }, [layers]);
  return (
    <section className="surface-layers-panel" aria-label="Pintakerrokset">
      <PaintScope value={scope} onChange={onScope} />
      <p className="layer-target">
        {name ?? 'Napsauta osaa tai pintaa'}
        {count > 1 && scope === 'body' ? ` · ${count} valittua osaa` : ''}
      </p>
      {name && basePreset && (
        <label>
          Pohjamateriaali
          <select
            aria-label="Pohjamateriaali"
            value={basePreset}
            disabled={busy}
            onChange={(e) => onBase(e.target.value)}
          >
            {!materialPresets.some((p) => p.id === basePreset) && (
              <option value={basePreset}>{findPreset(basePreset).name}</option>
            )}
            {[...new Set(materialPresets.map((p) => p.category))].map((category) => (
              <optgroup key={category} label={category}>
                {materialPresets
                  .filter((p) => p.category === category)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
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
      {kind === 'decal' && (
        <details
          className="decal-new"
          open={draftOpen}
          onToggle={(e) => setDraftOpen(e.currentTarget.open)}
        >
          <summary>Uusi tarra</summary>
          <DecalEditor
            value={draft.decal ?? defaultDecal()}
            assets={assets}
            disabled={busy}
            onAsset={onAsset}
            onChange={(decal) => onDraft({ ...draft, decal })}
          />
          <div className="layer-two-columns">
            <NumberField
              label="Tarran leveys (mm)"
              value={draft.width}
              min={1}
              disabled={busy}
              onChange={(width) => onDraft({ ...draft, width })}
            />
            <NumberField
              label="Tarran korkeus (mm)"
              value={draft.height}
              min={1}
              disabled={busy}
              onChange={(height) => onDraft({ ...draft, height })}
            />
          </div>
          <LayerColor
            layer={draft}
            busy={busy}
            onChange={(_, patch) => onDraft({ ...draft, ...patch })}
          />
        </details>
      )}
      <div className="layer-add-actions">
        {kind !== 'decal' && (
          <button className="button outlined" disabled={busy || !name} onClick={onAdd}>
            Lisää kerros
          </button>
        )}
        <button
          className={`button ${placing ? 'primary' : 'outlined'}`}
          aria-pressed={placing}
          disabled={busy}
          onClick={onPlace}
        >
          {placing
            ? 'Napsauta jäljen paikkaa'
            : kind === 'decal'
              ? 'Aseta tarra pinnalle'
              : 'Aseta paikallinen jälki'}
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
                aria-expanded={opened === layer.id || layers.length === 1}
                onClick={() => setOpened(opened === layer.id ? undefined : layer.id)}
              >
                {layer.kind === 'decal' && layer.decal?.type === 'text'
                  ? layer.decal.text.slice(0, 30) || 'Tekstitarra'
                  : layerNames[layer.kind]}
                <small>
                  {layer.center ? 'Paikallinen jälki' : 'Koko pinta'} ·{' '}
                  {layer.maskMode === 'manual'
                    ? `maalattu · ${layer.strokes?.length ?? 0} vetoa`
                    : `${layer.kind === 'paint' ? 'kuluma ' : ''}${Math.round(layer.amount * 100)} %`}
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
                {layer.kind === 'decal' && (
                  <>
                    <DecalEditor
                      value={layer.decal ?? defaultDecal()}
                      assets={assets}
                      disabled={busy}
                      onAsset={onAsset}
                      onChange={(decal) => onChange(layer.id, { decal })}
                    />
                    <div className="layer-two-columns">
                      <NumberField
                        label="Tarran kiilto (%)"
                        value={Math.round((1 - (layer.roughness ?? 0.8)) * 100)}
                        max={96}
                        disabled={busy}
                        onChange={(n) => onChange(layer.id, { roughness: 1 - n / 100 })}
                      />
                      <NumberField
                        label="Tarran kuluma (%)"
                        value={Math.round((layer.wear ?? 0) * 100)}
                        max={100}
                        disabled={busy}
                        onChange={(n) => onChange(layer.id, { wear: n / 100 })}
                      />
                    </div>
                    <NumberField
                      label="Pintakohouma (mm)"
                      value={layer.relief ?? 0}
                      min={-2}
                      max={2}
                      step={0.01}
                      disabled={busy}
                      onChange={(relief) => onChange(layer.id, { relief })}
                    />
                  </>
                )}
                {layer.kind !== 'decal' && (
                  <>
                    <label>
                      Kulumakuvion ohjaus
                      <select
                        aria-label="Kulumakuvion ohjaus"
                        value={layer.maskMode ?? 'automatic'}
                        disabled={busy}
                        onChange={(e) => {
                          onChange(layer.id, { maskMode: e.target.value as 'manual' });
                          if (e.target.value === 'automatic')
                            onBrush({ ...brush, layerId: undefined });
                        }}
                      >
                        <option value="automatic">Automaattinen</option>
                        <option value="manual">Maalaa itse</option>
                        <option value="combined">Yhdistelmä</option>
                      </select>
                    </label>
                    {layer.maskMode && layer.maskMode !== 'automatic' && (
                      <>
                        <button
                          className={`button ${brush.layerId === layer.id ? 'primary' : 'outlined'}`}
                          disabled={busy || !layer.enabled}
                          aria-pressed={brush.layerId === layer.id}
                          onClick={() =>
                            onBrush({
                              ...brush,
                              layerId: brush.layerId === layer.id ? undefined : layer.id,
                            })
                          }
                        >
                          {brush.layerId === layer.id
                            ? 'Lopeta kuluman maalaus'
                            : 'Maalaa kulumaa pinnalle'}
                        </button>
                        {brush.layerId === layer.id && (
                          <>
                            <small>
                              Vedä sivellintä pinnalla. Esc lopettaa. Valitse pinta ennen maalausta.
                            </small>
                            <div className="layer-two-columns">
                              <NumberField
                                label="Siveltimen koko (mm)"
                                value={brush.radius * 2}
                                min={0.2}
                                max={20000}
                                step={1}
                                disabled={busy}
                                onChange={(n) => onBrush({ ...brush, radius: n / 2 })}
                              />
                              <NumberField
                                label="Siveltimen voimakkuus (%)"
                                value={brush.strength * 100}
                                min={1}
                                max={100}
                                disabled={busy}
                                onChange={(n) => onBrush({ ...brush, strength: n / 100 })}
                              />
                            </div>
                            <NumberField
                              label="Siveltimen kovuus (%)"
                              value={brush.hardness * 100}
                              max={100}
                              disabled={busy}
                              onChange={(n) => onBrush({ ...brush, hardness: n / 100 })}
                            />
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={brush.erase}
                                onChange={(e) => onBrush({ ...brush, erase: e.target.checked })}
                              />
                              Kumita maalattua kulumaa
                            </label>
                          </>
                        )}
                        <button
                          className="button subtle"
                          disabled={busy || !layer.strokes?.length}
                          onClick={() => onChange(layer.id, { strokes: [] })}
                        >
                          Tyhjennä käsin maalattu maski
                        </button>
                      </>
                    )}
                  </>
                )}
                {layer.kind === 'paint' && (
                  <div className="layer-two-columns">
                    <LayerColor layer={layer} busy={busy} onChange={onChange} />
                    <NumberField
                      label="Maalin kiilto (%)"
                      value={Math.round((1 - (layer.roughness ?? 0.65)) * 100)}
                      max={96}
                      onChange={(n) => onChange(layer.id, { roughness: (100 - n) / 100 })}
                      disabled={busy}
                    />
                  </div>
                )}
                <div className={layer.kind === 'paint' ? 'layer-two-columns' : undefined}>
                  {!(layer.kind === 'paint' && layer.maskMode === 'manual') && (
                    <>
                      <NumberField
                        label={layer.kind === 'paint' ? 'Kuluma (%)' : 'Voimakkuus (%)'}
                        value={Math.round(layer.amount * 100)}
                        max={100}
                        onChange={(n) => onChange(layer.id, { amount: n / 100 })}
                        disabled={busy}
                      />
                      {layer.kind === 'paint' && (
                        <NumberField
                          label="Lohkeen koko (mm)"
                          value={layer.chipSize ?? 30}
                          min={0.5}
                          max={10000}
                          step={0.5}
                          onChange={(chipSize) => onChange(layer.id, { chipSize })}
                          disabled={busy}
                        />
                      )}
                    </>
                  )}
                </div>
                {layer.kind === 'paint' && layer.maskMode !== 'manual' && (
                  <>
                    <small>0 %: ehjä maali · 100 %: paljas pohjamateriaali</small>
                    <button
                      className="button outlined"
                      disabled={busy}
                      onClick={() => onChange(layer.id, { seed: (layer.seed + 1) % 1000000 })}
                    >
                      Vaihda kulumakuviota
                    </button>
                  </>
                )}
                {(layer.kind !== 'paint' || layer.center) && (
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
                )}
                <NumberField
                  label="Kierto (°)"
                  value={layer.rotation}
                  min={-360000}
                  max={360000}
                  onChange={(n) => onChange(layer.id, { rotation: n })}
                  disabled={busy}
                />
                {layer.kind !== 'paint' && (
                  <LayerColor layer={layer} busy={busy} onChange={onChange} />
                )}
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
                {layers.length > 1 && (
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
                )}
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
