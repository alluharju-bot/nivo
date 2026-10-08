import { EmissionControls } from '../ui/EmissionControls';
import { SurfaceMaps } from '../ui/MaterialSurface';
import { SurfaceFinish } from '../ui/SurfaceFinish';
import {
  traceDefaults,
  traceStatusLabel,
  type TraceStatus,
  type TraceOptions,
} from './progressive';
import type { RenderSnapshot } from './snapshot';
import type { RenderJobOptions } from './traceJob';
import {
  defaultAppearance,
  findPreset,
  hasAppearanceTexture,
  materialPresets,
  textureDefaults,
  type Appearance,
  type CustomMaterial,
  type TextureAsset,
  type TexturePlacement,
} from '../model/materials';
import { patternCanvas } from './materials';
import { woodGrainRotation } from '../model/textureVariation';
import { pbrMapUrl } from '../model/pbrCatalog';
import {
  surfaceCollectionName,
  surfaceGroups,
  type SurfaceGroup,
} from '../model/surfaceCollection';
import { importTexture, withColorTexture } from '../storage/textures';
import { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, Download, Maximize, MousePointer2, Paintbrush, Move } from 'lucide-react';
import type { BodyMesh } from '../cad/protocol';
import type { Body } from '../model/project';
import { CommitCheckbox } from '../ui/CommitCheckbox';
import { BodyColor } from '../ui/BodyColor';
import type { ColorPreview } from '../model/colorPreview';
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
  colorPreview?: ColorPreview;
  onPreviewColor: (ids: string[], color?: string) => void;
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
  const [tool, setTool] = useState<'select' | 'texture' | 'paint'>('select');
  const [brush, setBrush] = useState({
    appearance: defaultAppearance('oak'),
    color: findPreset('oak').color,
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(surfaceCollectionName);
  const [surfaceGroup, setSurfaceGroup] = useState<SurfaceGroup | ''>('Puut');
  const [textureDraft, setTextureDraft] = useState<{
    id: string;
    appearance: Appearance;
  }>();
  const textureSource = useRef<string>('');
  const draftRef = useRef(textureDraft);
  draftRef.current = textureDraft;
  const committing = useRef(false);
  const [materialName, setMaterialName] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const changeTexture = (texture: TexturePlacement) => {
    const old = draftRef.current;
    if (!old) return;
    const next = { ...old, appearance: { ...old.appearance, texture } };
    draftRef.current = next;
    setTextureDraft(next);
  };
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
      if (busy) return;
      if (tool === 'paint') {
        if (bodies.find((b) => b.id === id)?.locked) {
          setError('Osa on Hold-lukittu. Vapauta lukitus mallissa ennen maalaamista.');
          return;
        }
        setError('');
        const body = bodies.find((b) => b.id === id)!;
        void props.onAppearance(
          [id],
          {
            ...brush.appearance,
            texture:
              body.appearance?.preset === brush.appearance.preset
                ? body.appearance.texture
                : brush.appearance.texture,
          },
          brush.color,
        );
      } else void selectTarget(id);
    },
    assets: props.assets,
    selectedIds: target === 'all' ? [] : target === 'selection' ? selectedIds : [target],
    editingTexture: busy ? undefined : textureDraft,
    materialTool: tool,
    onTextureCommit: () => void acceptTexture(),
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
    api.current?.color(props.colorPreview);
  }, [bodies, meshes, props.assets]);
  useEffect(() => {
    api.current?.color(props.colorPreview);
  }, [props.colorPreview]);
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
    setTool('select');
    draftRef.current = undefined;
    setTextureDraft(undefined);
    api.current?.sync();
  };
  const acceptTexture = async () => {
    const draft = draftRef.current;
    if (!draft) return true;
    const body = bodies.find((b) => b.id === draft.id);
    if (
      JSON.stringify(body?.appearance ?? defaultAppearance(body?.material)) ===
      JSON.stringify(draft.appearance)
    )
      return true;
    if (busy || committing.current) return false;
    committing.current = true;
    try {
      return await props.onAppearance([draft.id], draft.appearance);
    } finally {
      committing.current = false;
    }
  };
  const selectTarget = async (id: string) => {
    if (await acceptTexture()) setTarget(id);
  };
  const chooseTool = async (next: typeof tool) => {
    if (!(await acceptTexture())) return;
    if (next === 'paint') setBrush({ appearance: structuredClone(appearance), color });
    setTool(next);
    setRenderTab('material');
  };
  // A tool outlives its selected surface, committed gestures and material changes.
  useEffect(() => {
    const candidates = bodies.filter(
      (b) =>
        target === 'all' || (target === 'selection' ? selectedIds.includes(b.id) : b.id === target),
    );
    const body = candidates.length === 1 ? candidates[0] : undefined;
    const a = body?.appearance ?? defaultAppearance(body?.material);
    const editable = tool === 'texture' && body && !body.locked && hasAppearanceTexture(a);
    const source = JSON.stringify(body);
    if (!editable) {
      draftRef.current = undefined;
      setTextureDraft(undefined);
      textureSource.current = '';
    } else if (draftRef.current?.id !== body.id || textureSource.current !== source) {
      textureSource.current = source;
      const next = { id: body.id, appearance: structuredClone(a) };
      draftRef.current = next;
      setTextureDraft(next);
    }
  }, [tool, target, bodies, selectedIds]);
  useEffect(() => {
    if (textureDraft) api.current?.appearance([textureDraft.id], textureDraft.appearance);
    api.current?.selection();
  }, [textureDraft, target, selectedIds, tool, busy]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (tool === 'select') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelTexture();
      } else if (e.key === 'Enter' && textureDraft) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void acceptTexture();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [textureDraft, busy, tool]);
  const targets = bodies.filter(
    (b) =>
      target === 'all' || (target === 'selection' ? selectedIds.includes(b.id) : b.id === target),
  );
  const ids = targets.map((b) => b.id);
  const material =
    tool === 'paint'
      ? brush.appearance.preset
      : (targets[0]?.appearance?.preset ?? targets[0]?.material ?? 'matte');
  const mixed =
    tool !== 'paint' &&
    targets.some((b) => (b.appearance?.preset ?? b.material ?? 'matte') !== material);
  const color = tool === 'paint' ? brush.color : (targets[0]?.color ?? '#d8c8a7');
  const appearance =
    tool === 'paint'
      ? brush.appearance
      : (targets[0]?.appearance ?? defaultAppearance(targets[0]?.material));
  const applyAppearance = (value: Appearance, nextColor = color) => {
    if (tool === 'paint') {
      setBrush({ appearance: value, color: nextColor });
      return Promise.resolve(true);
    }
    return props.onAppearance(ids, value, nextColor);
  };
  const preset = findPreset(appearance.preset);
  const choosePreset = async (id: string) => {
    if (!(await acceptTexture())) return;
    if (id.startsWith('custom:')) {
      const saved = props.materials?.find((m) => m.id === id.slice(7));
      if (saved) applyAppearance(saved.appearance, saved.color);
    } else if (materialPresets.some((p) => p.id === id)) {
      const p = findPreset(id);
      applyAppearance(defaultAppearance(id), p.color);
      setCategory(p.category);
      if (p.collectionGroup) setSurfaceGroup(p.collectionGroup);
    } else if (tool === 'paint') setBrush({ appearance: defaultAppearance(id), color });
    else props.onMaterial(ids, id as NonNullable<Body['material']>);
  };
  const thumbnailCache = useRef(new Map<string, string>());
  const thumbnails = useMemo(
    () =>
      materialPresets
        .filter((p) =>
          search.trim()
            ? `${p.name} ${p.category} ${p.collectionGroup ?? ''}`
                .toLocaleLowerCase('fi')
                .includes(search.trim().toLocaleLowerCase('fi'))
            : p.category === category &&
              (category !== surfaceCollectionName ||
                !surfaceGroup ||
                p.collectionGroup === surfaceGroup),
        )
        .map((p) => {
          if (p.pattern && !thumbnailCache.current.has(p.id))
            thumbnailCache.current.set(p.id, patternCanvas(p).toDataURL());
          return {
            ...p,
            image: p.pbr ? pbrMapUrl(p.pbr, 'color') : thumbnailCache.current.get(p.id),
          };
        }),
    [category, search, surfaceGroup],
  );
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importTexture(file);
      await props.onAppearance(
        ids,
        withColorTexture(appearance, imported.id, imported.asset),
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
          <button
            className="button subtle"
            onClick={async () => {
              if (await acceptTexture()) props.onClose();
            }}
          >
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
            {traceStatusLabel(trace)}
          </div>
        )}
        <p className="render-caption">
          {tool === 'texture'
            ? 'Tekstuuri: vedä kuviota tai säätimiä · klikkaa toista osaa vaihtaaksesi kohdetta · Esc lopettaa'
            : tool === 'paint'
              ? 'Maalaa: valitse materiaali ja klikkaa osia · oikea painike kiertää · Esc lopettaa'
              : 'Vedä kiertääksesi · rulla zoomaa · klikkaa osaa valitaksesi sen materiaalin'}
        </p>
      </div>
      <aside className="render-panel" aria-label="Renderöinnin asetukset">
        <div className="render-panel-header">
          <h2>Esityskuva</h2>
          <div className="render-material-tools" role="toolbar" aria-label="Pintatyökalut">
            <button
              aria-label="Valitse pinta"
              title="Valitse pinta"
              aria-pressed={tool === 'select'}
              disabled={busy}
              onClick={() => void chooseTool('select')}
            >
              <MousePointer2 size={16} />
              Valitse
            </button>
            <button
              aria-label="Muokkaa tekstuuria"
              title="Siirrä, kierrä ja skaalaa kuviota"
              aria-pressed={tool === 'texture'}
              disabled={busy}
              onClick={() => void chooseTool('texture')}
            >
              <Move size={16} />
              Tekstuuri
            </button>
            <button
              aria-label="Maalaa"
              title="Maalaa materiaali osia klikkaamalla"
              aria-pressed={tool === 'paint'}
              disabled={busy}
              onClick={() => void chooseTool('paint')}
            >
              <Paintbrush size={16} />
              Maalaa
            </button>
          </div>
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
                onClick={async () => {
                  if (id === 'image') {
                    if (!(await acceptTexture())) return;
                    setTool('select');
                  }
                  setRenderTab(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label hidden={renderTab !== 'material' || tool === 'paint'}>
            Käsiteltävät osat
            <select
              aria-label="Materiaalin kohde"
              value={target}
              disabled={busy}
              onChange={(e) => void selectTarget(e.target.value)}
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
        </div>
        <div className="render-panel-scroll">
          <div className="render-tab-content" hidden={renderTab !== 'material'}>
            {tool !== 'paint' && targets.some((b) => b.locked) && (
              <p className="muted" role="status">
                Valinnassa on Hold-lukittu osa. Vapauta lukitus mallissa ennen materiaalin
                muokkaamista.
              </p>
            )}
            {tool === 'texture' && !textureDraft && (
              <p className="muted" role="status">
                Klikkaa yhtä teksturoitua osaa. Voit myös valita osan ja lisätä sille materiaalin
                alla.
              </p>
            )}
            {tool === 'paint' && (
              <p className="muted" role="status">
                Valitse siveltimen materiaali ja klikkaa maalattavia osia. Esc lopettaa maalaamisen.
              </p>
            )}
            <fieldset
              className="render-material-fields"
              disabled={tool !== 'paint' && targets.some((b) => b.locked)}
            >
              <label>
                Materiaali
                <select
                  aria-label="Materiaali"
                  disabled={busy || !ids.length}
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
                    Etsi materiaalia
                    <input
                      type="search"
                      aria-label="Etsi materiaalia"
                      placeholder="Esim. betoni, laatta tai pähkinä"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label>
                    Materiaaliryhmä
                    <select
                      aria-label="Materiaaliryhmä"
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setSearch('');
                      }}
                    >
                      {[...new Set(materialPresets.map((p) => p.category))].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  {category === surfaceCollectionName && !search.trim() && (
                    <label>
                      Pinta
                      <select
                        aria-label="Pintakokoelman pinnat"
                        value={surfaceGroup}
                        onChange={(e) => setSurfaceGroup(e.target.value as SurfaceGroup | '')}
                      >
                        <option value="">Kaikki pinnat</option>
                        {surfaceGroups.map((group) => (
                          <option key={group}>{group}</option>
                        ))}
                      </select>
                    </label>
                  )}
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
              {!textureDraft && (
                <BodyColor
                  key={`${tool}:${target}:${ids.join(',')}`}
                  onPreview={
                    tool === 'paint' ? undefined : (color) => props.onPreviewColor(ids, color)
                  }
                  color={color}
                  mixed={tool !== 'paint' && targets.some((b) => b.color !== color)}
                  busy={busy || !ids.length || !!textureDraft}
                  onChange={(value) =>
                    tool === 'paint'
                      ? setBrush({ ...brush, color: value })
                      : props.onColor(ids, value)
                  }
                />
              )}
              {!textureDraft && (
                <>
                  {hasAppearanceTexture(appearance) && (
                    <p className="muted">
                      Väri sävyttää tekstuuria. Valkoinen näyttää kuvan alkuperäiset värit.
                    </p>
                  )}
                  <SurfaceFinish
                    appearance={appearance}
                    busy={busy || !ids.length}
                    onChange={applyAppearance}
                  />
                  <details>
                    <summary>Pinnan lisäsäädöt</summary>
                    <div className="surface-properties">
                      {(['roughness', 'metalness', 'transmission', 'clearcoat'] as const).map(
                        (key) => (
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
                                  applyAppearance({
                                    ...appearance,
                                    [key]: n,
                                  });
                              }}
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </details>
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
                    disabled={busy || !ids.length || tool === 'paint'}
                    onClick={() => imageInput.current?.click()}
                  >
                    Lisää kuva
                  </button>
                  {appearance.assetId && (
                    <p className="muted">
                      {props.assets?.[appearance.assetId]?.name ?? 'Kuva puuttuu'}
                    </p>
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
                    Vedä kuviota tai kahvoja: ↗ koko, ↻ kierto. Veto tallentuu heti; Enter hyväksyy
                    luvut. Oikea painike kiertää kameraa.
                  </p>
                  {(preset.grainAxis ||
                    ['oak', 'pine', 'birch', 'walnut'].includes(preset.pattern ?? '')) &&
                    !appearance.assetId && (
                      <button
                        className="button outlined full"
                        disabled={busy}
                        onClick={() => {
                          const body = bodies.find((b) => b.id === textureDraft.id)!;
                          const next = {
                            ...textureDraft.appearance,
                            texture: {
                              ...textureDraft.appearance.texture,
                              rotation: woodGrainRotation(
                                body,
                                meshes.find((m) => m.id === body.id),
                              ),
                            },
                          };
                          void props.onAppearance([body.id], next);
                        }}
                      >
                        Suuntaa puunsyyt pituussuuntaan
                      </button>
                    )}
                  <div className="texture-fields">
                    {(['width', 'height', 'offsetX', 'offsetY', 'rotation'] as const).map((key) => (
                      <label key={key}>
                        {
                          {
                            width: 'Leveys (mm)',
                            height: 'Korkeus (mm)',
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
                  </div>
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
                        ...(asset
                          ? textureDefaults
                          : defaultAppearance(textureDraft.appearance.preset).texture),
                        height: asset
                          ? (textureDefaults.width * asset.height) / asset.width
                          : defaultAppearance(textureDraft.appearance.preset).texture.height,
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
                  <button
                    className="button outlined full"
                    title="Peruu keskeneräiset numeroarvot; tallennetut hiirivedot säilyvät"
                    onClick={cancelTexture}
                  >
                    Lopeta tekstuurityökalu · Esc
                  </button>
                </section>
              )}
              {!textureDraft && tool !== 'paint' && (
                <SurfaceMaps
                  appearance={appearance}
                  assets={props.assets}
                  busy={busy || !ids.length}
                  onChange={(value, color, asset) => props.onAppearance(ids, value, color, asset)}
                />
              )}
              <details className="emission-controls">
                <summary>Osa valonlähteenä</summary>
                <EmissionControls
                  appearance={appearance}
                  color={color}
                  busy={busy || !ids.length || !!textureDraft}
                  onChange={(value) => applyAppearance(value)}
                />
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
                      void props.onSettings({
                        ...settings,
                        environmentPower: Number(e.target.value),
                      })
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
                  aria-pressed={['loading', 'rendering', 'paused', 'complete'].includes(
                    trace.state,
                  )}
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
                    <option value={4096}>4 096 näytettä · sisätilat</option>
                    <option value={0}>Jatkuva</option>
                  </select>
                </label>
                <label className="checkbox-label">
                  <CommitCheckbox
                    label="Kohinan pehmennys"
                    checked={traceOptions.denoise !== false}
                    onChange={async (denoise) => {
                      const next = { ...traceOptions, denoise };
                      setTraceOptions(next);
                      api.current?.trace.configure(next);
                    }}
                  />
                  Kohinan pehmennys
                </label>
              </div>
              {trace.state !== 'off' && (
                <>
                  <p role="status" data-testid="trace-status">
                    {traceStatusLabel(trace)}
                  </p>
                  {trace.state === 'loading' && (
                    <p className="muted">
                      Näytetään vielä nopea esikatselu. Tarkennus käynnistyy automaattisesti
                      valmistelun jälkeen; ensimmäinen käynnistys voi kestää hetken.
                    </p>
                  )}
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
                    <option value={4096}>4 096 · Sisätilan valaistus</option>
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
                        props.onStartRender(
                          snapshot,
                          { width, samples: jobSamples, denoise: traceOptions.denoise },
                          props.name,
                        );
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
              Kuva seuraa nykyistä kuvakulmaa. Rakennusmuodot, apuviivat ja valintakorostukset
              jäävät pois.
            </p>
          </div>
          {(error || props.error) && (
            <p role="alert" className="render-error">
              {error || props.error}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}
