import { SurfaceMaps } from '../ui/MaterialSurface';
import { traceDefaults, type TraceStatus, type TraceOptions } from './progressive';
import type { RenderSnapshot } from './snapshot';
import type { RenderJobOptions } from './traceJob';
import {
  defaultAppearance,
  emissionSettings,
  findPreset,
  materialPresets,
  textureDefaults,
  type Appearance,
  type CustomMaterial,
  type TextureAsset,
  type TexturePlacement,
} from '../model/materials';
import { patternCanvas } from './materials';
import { importTexture } from '../storage/textures';
import { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, Download, Maximize } from 'lucide-react';
import type { BodyMesh } from '../cad/protocol';
import type { Body } from '../model/project';
import { CommitCheckbox } from '../ui/CommitCheckbox';
import { BodyColor } from '../ui/BodyColor';
import { downloadFile, safeFilename } from '../storage/projects';
import { createRenderScene, materialNames, type RenderSettings } from './scene';

type Props = {
  onStartRender: (snapshot: RenderSnapshot, options: RenderJobOptions, name: string) => void;
  renderJobActive: boolean;
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
  assets?: Record<string, TextureAsset>;
  materials?: CustomMaterial[];
  onAppearance: (
    ids: string[],
    appearance: Appearance,
    color?: string,
    asset?: { id: string; asset: TextureAsset },
  ) => Promise<boolean>;
  onSaveMaterial: (name: string, appearance: Appearance, color: string) => Promise<boolean>;
};

function TextureNumber({
  value,
  min,
  max,
  label,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onValue: (value: number) => void;
}) {
  const display = (n: number) => String(Math.round(n * 100) / 100);
  const [text, setText] = useState(() => display(value));
  useEffect(() => setText(display(value)), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      step="any"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const raw = e.currentTarget.value,
          n = Number(raw);
        setText(raw);
        if (raw && Number.isFinite(n) && n >= min && n <= max) onValue(n);
      }}
      onBlur={() => setText(display(value))}
    />
  );
}

export function RenderStage(props: Props) {
  const { bodies, meshes, settings, selectedIds, busy } = props;
  const [target, setTarget] = useState(
    selectedIds.some((id) => bodies.some((b) => b.id === id)) ? 'selection' : 'all',
  );
  const [exposure, setExposure] = useState(settings.exposure);
  const [width, setWidth] = useState(2400);
  const [jobSamples, setJobSamples] = useState(64);
  const [exportMode, setExportMode] = useState<'quick' | 'path'>('quick');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [renderTab, setRenderTab] = useState<'material' | 'image'>('material');
  const [traceOptions, setTraceOptions] = useState<TraceOptions>(traceDefaults);
  const [trace, setTrace] = useState<TraceStatus>({ state: 'off', samples: 0 });
  const [category, setCategory] = useState('Massiivipuut');
  const [textureDraft, setTextureDraft] = useState<{
    id: string;
    appearance: Appearance;
  }>();
  const textureSource = useRef<string>('');
  const [materialName, setMaterialName] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const changeTexture = (texture: TexturePlacement) =>
    setTextureDraft((old) => (old ? { ...old, appearance: { ...old.appearance, texture } } : old));
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof createRenderScene>>(undefined);
  const latest = useRef<Parameters<typeof createRenderScene>[1] extends () => infer P ? P : never>({
    bodies,
    meshes,
    settings,
    onPick: setTarget,
    onTexture: changeTexture,
    onTraceStatus: setTrace,
  });
  latest.current = {
    bodies,
    meshes,
    settings: { ...settings, exposure },
    onPick: (id) => {
      if (!textureDraft) setTarget(id);
    },
    assets: props.assets,
    selectedIds: target === 'all' ? [] : target === 'selection' ? selectedIds : [target],
    editingTexture: textureDraft,
    onTexture: changeTexture,
    onTraceStatus: setTrace,
  };
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
    if (
      textureDraft &&
      textureSource.current !== JSON.stringify(bodies.find((b) => b.id === textureDraft.id))
    )
      setTextureDraft(undefined);
  }, [bodies, meshes, props.assets]);
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
  const cancelTexture = () => {
    setTextureDraft(undefined);
    api.current?.sync();
  };
  const acceptTexture = async () => {
    if (textureDraft && (await props.onAppearance([textureDraft.id], textureDraft.appearance)))
      setTextureDraft(undefined);
  };
  useEffect(() => {
    if (textureDraft) api.current?.appearance([textureDraft.id], textureDraft.appearance);
    api.current?.selection();
  }, [textureDraft, target, selectedIds]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!textureDraft) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelTexture();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void acceptTexture();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [textureDraft, busy]);
  const targets = bodies.filter(
    (b) =>
      target === 'all' || (target === 'selection' ? selectedIds.includes(b.id) : b.id === target),
  );
  const ids = targets.map((b) => b.id);
  const material = targets[0]?.appearance?.preset ?? targets[0]?.material ?? 'matte';
  const mixed = targets.some((b) => (b.appearance?.preset ?? b.material ?? 'matte') !== material);
  const color = targets[0]?.color ?? '#d8c8a7';
  const appearance = targets[0]?.appearance ?? defaultAppearance(targets[0]?.material);
  const preset = findPreset(appearance.preset);
  const emission = emissionSettings(appearance, color);
  const changeEmission = (patch: Partial<typeof emission>) =>
    props.onAppearance(ids, { ...appearance, emission: { ...emission, ...patch } });
  const choosePreset = (id: string) => {
    if (id.startsWith('custom:')) {
      const saved = props.materials?.find((m) => m.id === id.slice(7));
      if (saved) void props.onAppearance(ids, saved.appearance, saved.color);
    } else if (materialPresets.some((p) => p.id === id)) {
      const p = findPreset(id);
      void props.onAppearance(ids, defaultAppearance(id), p.color);
      setCategory(p.category);
    } else props.onMaterial(ids, id as NonNullable<Body['material']>);
  };
  const thumbnails = useMemo(
    () =>
      materialPresets
        .filter((p) => p.category === category)
        .map((p) => ({
          ...p,
          image: p.pattern ? patternCanvas(p).toDataURL() : undefined,
        })),
    [category],
  );
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importTexture(file);
      await props.onAppearance(
        ids,
        {
          ...appearance,
          assetId: imported.id,
          texture: {
            ...textureDefaults,
            height: (textureDefaults.width * imported.asset.height) / imported.asset.width,
          },
        },
        '#ffffff',
        imported,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
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
        {['rendering', 'paused', 'complete', 'loading'].includes(trace.state) && (
          <div className="trace-badge" role="status">
            {trace.state === 'loading'
              ? 'Valmistellaan kuvaa…'
              : `${trace.state === 'complete' ? 'Tavoite saavutettu' : trace.state === 'paused' ? 'Tauolla' : 'Kuva tarkentuu'} · ${trace.samples} näytettä`}
          </div>
        )}
        <p className="render-caption">
          Vedä kiertääksesi · rulla zoomaa · klikkaa osaa valitaksesi sen materiaalin
        </p>
      </div>
      <aside className="render-panel" aria-label="Renderöinnin asetukset">
        <span className="eyebrow">ESITYSKUVA</span>
        <h2>Esityskuva</h2>
        <div className="render-tabs" aria-label="Esityskuvan toiminnot">
          {(
            [
              ['material', 'Materiaali'],
              ['image', 'Kuva'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={renderTab === id}
              disabled={!!textureDraft && id !== 'material'}
              onClick={() => setRenderTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Käsiteltävät osat
          <select
            aria-label="Materiaalin kohde"
            value={target}
            disabled={!!textureDraft}
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
        <div className="render-tab-content" hidden={renderTab !== 'material'}>
          {targets.some((b) => b.locked) && (
            <p className="muted" role="status">
              Valinnassa on Hold-lukittu osa. Vapauta lukitus mallissa ennen materiaalin
              muokkaamista.
            </p>
          )}
          <fieldset className="render-material-fields" disabled={targets.some((b) => b.locked)}>
            <label>
              Materiaali
              <select
                aria-label="Materiaali"
                disabled={busy || !ids.length || !!textureDraft}
                value={mixed ? '' : material}
                onChange={(e) => choosePreset(e.target.value)}
              >
                {mixed && (
                  <option value="" disabled>
                    Useita materiaaleja
                  </option>
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
                {!!props.materials?.length && (
                  <optgroup label="Projektin materiaalit">
                    {props.materials.map((m) => (
                      <option key={m.id} value={`custom:${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {Object.entries(materialNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {!textureDraft && (
              <>
                <label>
                  Materiaaliryhmä
                  <select
                    aria-label="Materiaaliryhmä"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {[...new Set(materialPresets.map((p) => p.category))].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <div className="material-swatches">
                  {thumbnails.map((p) => (
                    <button
                      key={p.id}
                      title={p.name}
                      aria-label={p.name}
                      aria-pressed={material === p.id}
                      disabled={busy || !ids.length}
                      onClick={() => choosePreset(p.id)}
                    >
                      <span
                        style={{
                          backgroundColor: p.color,
                          backgroundImage: p.image ? `url(${p.image})` : undefined,
                          backgroundBlendMode: 'multiply',
                        }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <BodyColor
              color={color}
              mixed={targets.some((b) => b.color !== color)}
              busy={busy || !ids.length || !!textureDraft}
              onChange={(value) => props.onColor(ids, value)}
            />
            {!textureDraft && (
              <>
                <div className="surface-properties">
                  {(['roughness', 'metalness', 'transmission', 'clearcoat'] as const).map((key) => (
                    <label key={key}>
                      {
                        {
                          roughness: 'Karheus',
                          metalness: 'Metallisuus',
                          transmission: 'Läpäisevyys',
                          clearcoat: 'Pinnoite',
                        }[key]
                      }
                      <input
                        key={`${ids.join()}:${appearance[key]}:${preset.id}`}
                        aria-label={
                          {
                            roughness: 'Karheus',
                            metalness: 'Metallisuus',
                            transmission: 'Läpäisevyys',
                            clearcoat: 'Pinnoite',
                          }[key]
                        }
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        disabled={busy || !ids.length}
                        defaultValue={appearance[key] ?? preset[key] ?? 0}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (
                            Number.isFinite(n) &&
                            n >= 0 &&
                            n <= 1 &&
                            n !== (appearance[key] ?? preset[key] ?? 0)
                          )
                            void props.onAppearance(ids, {
                              ...appearance,
                              [key]: n,
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  className="button outlined full"
                  disabled={busy || !ids.length}
                  onClick={() => imageInput.current?.click()}
                >
                  Lisää kuva
                </button>
                {appearance.assetId && (
                  <p className="muted">
                    {props.assets?.[appearance.assetId]?.name ?? 'Kuva puuttuu'}
                  </p>
                )}
                <button
                  className="button outlined full"
                  disabled={busy || ids.length !== 1 || (!appearance.assetId && !preset.pattern)}
                  onClick={() => {
                    textureSource.current = JSON.stringify(targets[0]);
                    setTextureDraft({
                      id: ids[0],
                      appearance: structuredClone(appearance),
                    });
                  }}
                >
                  Muokkaa tekstuuria
                </button>
                {ids.length !== 1 && (
                  <p className="muted">Valitse yksi osa tekstuurin sijoitteluun.</p>
                )}
                <details>
                  <summary>Tallenna oma materiaali</summary>
                  <label>
                    Nimi
                    <input
                      aria-label="Oman materiaalin nimi"
                      value={materialName}
                      maxLength={80}
                      onChange={(e) => setMaterialName(e.target.value)}
                    />
                  </label>
                  <button
                    className="button outlined full"
                    disabled={busy || !ids.length || !materialName.trim()}
                    onClick={() =>
                      void props
                        .onSaveMaterial(materialName.trim(), appearance, color)
                        .then((ok) => {
                          if (ok) setMaterialName('');
                        })
                    }
                  >
                    Tallenna materiaali projektiin
                  </button>
                </details>
              </>
            )}
            {textureDraft && (
              <section className="texture-editor" aria-label="Tekstuurin sijoittelu">
                <h3>Tekstuurin sijoittelu</h3>
                <p>
                  Vedä pintaa siirtääksesi kuviota. ↗ säätää kokoa, ↻ kiertää. Oikea painike kiertää
                  kameraa.
                </p>
                {(['width', 'height', 'offsetX', 'offsetY', 'rotation'] as const).map((key) => (
                  <label key={key}>
                    {
                      {
                        width: 'Kuvion leveys (mm)',
                        height: 'Kuvion korkeus (mm)',
                        offsetX: 'Siirtymä U (mm)',
                        offsetY: 'Siirtymä V (mm)',
                        rotation: 'Kierto (°)',
                      }[key]
                    }
                    <TextureNumber
                      label={
                        {
                          width: 'Kuvion leveys',
                          height: 'Kuvion korkeus',
                          offsetX: 'Siirtymä U',
                          offsetY: 'Siirtymä V',
                          rotation: 'Tekstuurin kierto',
                        }[key]
                      }
                      value={textureDraft.appearance.texture[key]}
                      min={
                        key === 'width' || key === 'height'
                          ? 0.1
                          : key === 'rotation'
                            ? -360000
                            : -100000
                      }
                      max={key === 'rotation' ? 360000 : 100000}
                      onValue={(n) => {
                        const old = textureDraft.appearance.texture,
                          next = { ...old, [key]: n };
                        if (old.lockAspect && key === 'width')
                          next.height = (old.height * n) / old.width;
                        if (old.lockAspect && key === 'height')
                          next.width = (old.width * n) / old.height;
                        if (
                          next.width < 0.1 ||
                          next.width > 100000 ||
                          next.height < 0.1 ||
                          next.height > 100000
                        )
                          return;
                        changeTexture(next);
                      }}
                    />
                  </label>
                ))}
                <label className="render-check">
                  <input
                    type="checkbox"
                    checked={textureDraft.appearance.texture.lockAspect}
                    onChange={(e) =>
                      changeTexture({
                        ...textureDraft.appearance.texture,
                        lockAspect: e.target.checked,
                      })
                    }
                  />
                  Lukitse kuvasuhde
                </label>
                <button
                  className="button outlined full"
                  onClick={() => {
                    const asset = textureDraft.appearance.assetId
                      ? props.assets?.[textureDraft.appearance.assetId]
                      : undefined;
                    changeTexture({
                      ...textureDefaults,
                      height: asset
                        ? (textureDefaults.width * asset.height) / asset.width
                        : textureDefaults.height,
                    });
                  }}
                >
                  Palauta sijoittelu
                </button>
                <button
                  className="button dark full"
                  disabled={busy}
                  onClick={() => void acceptTexture()}
                >
                  Hyväksy tekstuuri · Enter
                </button>
                <button className="button outlined full" onClick={cancelTexture}>
                  Peru tekstuuri · Esc
                </button>
              </section>
            )}
            {!textureDraft && (
              <SurfaceMaps
                appearance={appearance}
                assets={props.assets}
                busy={busy || !ids.length}
                onChange={(value, color, asset) => props.onAppearance(ids, value, color, asset)}
              />
            )}
            <details className="emission-controls">
              <summary>Osa valonlähteenä</summary>
              <label className="render-check">
                <CommitCheckbox
                  label="Valaiseva materiaali"
                  checked={emission.enabled}
                  disabled={busy || !ids.length}
                  onChange={(enabled) => changeEmission({ enabled })}
                />
                Valaiseva materiaali
              </label>
              {emission.enabled && (
                <>
                  <label>
                    Valon tyyppi
                    <select
                      aria-label="Valon tyyppi"
                      value={emission.type}
                      disabled={busy}
                      onChange={(e) =>
                        void changeEmission({ type: e.target.value as 'surface' | 'spot' })
                      }
                    >
                      <option value="surface">Valaiseva pinta · LED / taustavalo</option>
                      <option value="spot">Kohdevalo · spotti</option>
                    </select>
                  </label>
                  <label>
                    Valon väri
                    <input
                      aria-label="Valon väri"
                      type="color"
                      defaultValue={emission.color}
                      key={emission.color}
                      disabled={busy}
                      onBlur={(e) => {
                        if (e.target.value !== emission.color)
                          void changeEmission({ color: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Voimakkuus
                    <input
                      aria-label="Valon voimakkuus"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      key={emission.intensity}
                      defaultValue={emission.intensity}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (e.target.value && Number.isFinite(n) && n >= 0 && n <= 100)
                          void changeEmission({ intensity: n });
                        else e.target.value = String(emission.intensity);
                      }}
                    />
                  </label>
                  {emission.type === 'spot' && (
                    <>
                      <label>
                        Suunta
                        <select
                          aria-label="Spotin suunta"
                          value={emission.direction}
                          disabled={busy}
                          onChange={(e) =>
                            void changeEmission({
                              direction: e.target.value as typeof emission.direction,
                            })
                          }
                        >
                          {(['-z', 'z', '-y', 'y', '-x', 'x'] as const).map((d) => (
                            <option key={d} value={d}>
                              {
                                {
                                  '-z': 'Alas −Z',
                                  z: 'Ylös +Z',
                                  '-y': 'Eteen −Y',
                                  y: 'Taakse +Y',
                                  '-x': 'Vasen −X',
                                  x: 'Oikea +X',
                                }[d]
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Keilan kulma (°)
                        <input
                          aria-label="Spotin kulma"
                          type="number"
                          min="5"
                          max="160"
                          key={emission.angle}
                          defaultValue={emission.angle}
                          disabled={busy}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (e.target.value && Number.isFinite(n) && n >= 5 && n <= 160)
                              void changeEmission({ angle: n });
                            else e.target.value = String(emission.angle);
                          }}
                        />
                      </label>
                    </>
                  )}
                  <p className="muted">
                    Tarkentuva renderöinti laskee myös pinnan valon ympäröiviin osiin. Spotti
                    valaisee jo nopeassa esikatselussa.
                  </p>
                </>
              )}
            </details>
          </fieldset>
          <details className="studio-lighting">
            <summary>Studion valaistus</summary>
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
            <details className="studio-controls">
              <summary>Studion säädöt</summary>
              <label>
                Valon suunta
                <select
                  aria-label="Studiovalon suunta"
                  value={settings.lightRotation ?? 0}
                  disabled={busy}
                  onChange={(e) =>
                    void props.onSettings({ ...settings, lightRotation: Number(e.target.value) })
                  }
                >
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((value) => (
                    <option key={value} value={value}>
                      {value}°
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Studiovalot
                <select
                  aria-label="Studiovalojen voimakkuus"
                  value={settings.lightPower ?? 1}
                  disabled={busy}
                  onChange={(e) =>
                    void props.onSettings({ ...settings, lightPower: Number(e.target.value) })
                  }
                >
                  {[0, 0.25, 0.5, 1, 2, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Pois' : `${value * 100} %`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ympäristövalo
                <select
                  aria-label="Ympäristövalon voimakkuus"
                  value={settings.environmentPower ?? 1}
                  disabled={busy}
                  onChange={(e) =>
                    void props.onSettings({ ...settings, environmentPower: Number(e.target.value) })
                  }
                >
                  {[0, 0.25, 0.5, 1, 2, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Pois' : `${value * 100} %`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="render-check">
                <CommitCheckbox
                  label="Studion lattia"
                  checked={settings.ground ?? true}
                  disabled={busy}
                  onChange={(ground) => props.onSettings({ ...settings, ground })}
                />{' '}
                Studion lattia
              </label>
            </details>
            <label className="render-check">
              <CommitCheckbox
                label="Varjot"
                checked={settings.shadows}
                disabled={busy}
                onChange={(shadows) => props.onSettings({ ...settings, shadows })}
              />
              Varjot
            </label>
          </details>
        </div>
        <div className="render-tab-content" hidden={renderTab !== 'image'}>
          <section className="trace-controls" aria-label="Tarkentuva renderöinti">
            <div className="trace-buttons">
              <button
                className="button outlined"
                aria-pressed={trace.state === 'off' || trace.state === 'error'}
                onClick={() => api.current?.trace.stop()}
              >
                Nopea
              </button>
              <button
                className="button outlined"
                disabled={
                  trace.state === 'loading' ||
                  !bodies.length ||
                  !!textureDraft ||
                  props.renderJobActive
                }
                aria-pressed={['loading', 'rendering', 'paused', 'complete'].includes(trace.state)}
                onClick={() => void api.current?.trace.start()}
              >
                Tarkentuva
              </button>
            </div>
            <div className="trace-options" hidden={trace.state === 'off'}>
              <label>
                Esikatselun tarkkuus
                <select
                  aria-label="Esikatselun tarkkuus"
                  value={traceOptions.quality}
                  onChange={(e) => {
                    const next = {
                      ...traceOptions,
                      quality: e.target.value as TraceOptions['quality'],
                    };
                    setTraceOptions(next);
                    api.current?.trace.configure(next);
                  }}
                >
                  <option value="draft">Kevyt</option>
                  <option value="full">Täysi</option>
                </select>
              </label>
              <label>
                Tarkennuksen tavoite
                <select
                  aria-label="Tarkennuksen tavoite"
                  value={traceOptions.maxSamples}
                  onChange={(e) => {
                    const next = { ...traceOptions, maxSamples: Number(e.target.value) };
                    setTraceOptions(next);
                    api.current?.trace.configure(next);
                  }}
                >
                  <option value={8}>8 näytettä</option>
                  <option value={64}>64 näytettä</option>
                  <option value={256}>256 näytettä</option>
                  <option value={1024}>1 024 näytettä</option>
                  <option value={0}>Jatkuva</option>
                </select>
              </label>
            </div>
            {trace.state !== 'off' && (
              <>
                <p role="status" data-testid="trace-status">
                  {trace.state === 'loading'
                    ? 'Valmistellaan renderöintiä…'
                    : trace.state === 'error'
                      ? trace.message
                      : `${trace.state === 'complete' ? 'Tavoite saavutettu' : trace.state === 'paused' ? 'Tauolla' : 'Kuva tarkentuu'} · ${trace.samples} näytettä`}
                </p>
                {['rendering', 'paused', 'complete'].includes(trace.state) && (
                  <>
                    <button
                      className="button subtle"
                      onClick={() =>
                        trace.state === 'complete'
                          ? api.current?.trace.restart()
                          : api.current?.trace.pause(trace.state !== 'paused')
                      }
                    >
                      {trace.state === 'complete'
                        ? 'Aloita tarkennus uudelleen'
                        : trace.state === 'paused'
                          ? 'Jatka renderöintiä'
                          : 'Tauota renderöinti'}
                    </button>
                    <button
                      className="button dark full"
                      disabled={trace.samples < 1}
                      onClick={() => {
                        void api.current?.trace
                          .exportPNG()
                          .then((blob) =>
                            downloadFile(
                              blob,
                              `${safeFilename(props.name)}-render.png`,
                              'image/png',
                            ),
                          )
                          .catch((e) => setError(e.message));
                      }}
                    >
                      Tallenna tarkentuva kuva PNG
                    </button>
                    <p className="muted">
                      Kamera- ja materiaalimuutokset aloittavat tarkennuksen uudelleen. Kuva
                      tallentuu näkymän kokoisena.
                    </p>
                  </>
                )}
              </>
            )}
          </section>
          <label>
            Kuvan leveys
            <select
              aria-label="Kuvan leveys"
              value={width}
              disabled={exporting}
              onChange={(e) => setWidth(Number(e.target.value))}
            >
              <option value={800}>800 px</option>
              <option value={1600}>1 600 px</option>
              <option value={2400}>2 400 px</option>
            </select>
          </label>
          <label>
            Kuvan laskenta
            <select
              aria-label="Kuvan laskenta"
              value={exportMode}
              onChange={(e) => setExportMode(e.target.value as 'quick' | 'path')}
            >
              <option value="quick">Nopea esikatselu</option>
              <option value="path">Tarkka · path tracing</option>
            </select>
          </label>
          {exportMode === 'path' ? (
            <>
              <label>
                Näytteitä / pikseli
                <select
                  aria-label="Kuvan näytemäärä"
                  value={jobSamples}
                  onChange={(e) => setJobSamples(Number(e.target.value))}
                >
                  <option value={8}>8 · Valon kokeilu</option>
                  <option value={64}>64 · Luonnos</option>
                  <option value={256}>256 · Esityskuva</option>
                  <option value={1024}>1 024 · Viimeistelty</option>
                </select>
              </label>
              <button
                className="button dark full"
                disabled={
                  busy || exporting || !bodies.length || !!textureDraft || props.renderJobActive
                }
                onClick={async () => {
                  setExporting(true);
                  try {
                    api.current?.trace.stop();
                    const snapshot = await api.current?.capture();
                    if (snapshot)
                      props.onStartRender(snapshot, { width, samples: jobSamples }, props.name);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting
                  ? 'Valmistellaan kuvaa…'
                  : props.renderJobActive
                    ? 'Kuvan laskenta käynnissä…'
                    : 'Laske tarkka kuva'}
              </button>
              <p className="muted">
                Voit jatkaa mallintamista laskennan aikana. Kuva käyttää tämänhetkistä mallia ja
                kameraa. Useampi näyte vähentää kohinaa. Välilehden sulkeminen tai päivittäminen
                lopettaa työn.
              </p>
            </>
          ) : (
            <button
              className="button primary full"
              disabled={busy || exporting || !bodies.length}
              onClick={() => {
                api.current?.trace.stop();
                void exportImage();
              }}
            >
              <Download size={16} />
              {exporting ? 'Tallennetaan kuvaa…' : 'Tallenna PNG'}
            </button>
          )}
          <p className="render-note">
            Kuva seuraa nykyistä kuvakulmaa. Rakennusmuodot, apuviivat ja valintakorostukset jäävät
            pois.
          </p>
        </div>
        {(error || props.error) && (
          <p role="alert" className="render-error">
            {error || props.error}
          </p>
        )}
      </aside>
    </section>
  );
}
