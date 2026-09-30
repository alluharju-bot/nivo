import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Box,
  Check,
  CircleHelp,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers2,
  Maximize,
  MousePointer2,
  Move3D,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Ruler,
  Square,
  Trash2,
  Undo2,
  X,
  XCircle,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import { Viewport, type CameraCommand, type Tool } from './viewport/Viewport';
import { DrawingPanel } from './drawing/DrawingPanel';
import { recommendedScale, type Sheet } from './drawing/svg';
import { useEditor } from './useEditor';
import {
  cabinetProject,
  dimensionValue,
  freshProject,
  makeBody,
  parseProject,
  uid,
  type Axis,
  type Body,
  type FaceRef,
  type Vec3,
  type View,
} from './model/project';
import { formatLength, parseLength } from './model/units';
import { downloadFile, safeFilename } from './storage/projects';
import type { DrawingView } from './cad/protocol';

const faceNames: Record<FaceRef, string> = {
  'x:min': 'Vasen pinta',
  'x:max': 'Oikea pinta',
  'y:min': 'Etupinta',
  'y:max': 'Takapinta',
  'z:min': 'Alapinta',
  'z:max': 'Yläpinta',
};
const tools: { id: Tool; label: string; icon: ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Valitse', icon: <MousePointer2 />, shortcut: 'V' },
  { id: 'rectangle', label: 'Suorakulmio', icon: <Square />, shortcut: 'R' },
  { id: 'extrude', label: 'Push / pull', icon: <ArrowUpFromLine />, shortcut: 'P' },
  { id: 'move', label: 'Siirrä', icon: <Move3D />, shortcut: 'M' },
  { id: 'navigate', label: 'Navigoi', icon: <Hand />, shortcut: 'H' },
];
const instructions: Record<Tool, string> = {
  select: 'Napauta kappaletta tai pintaa. Kahdella sormella voit panoroida ja zoomata.',
  rectangle: 'Piirrä XY-tasolle tai anna mitat. Hyväksy, kun suorakulmio on valmis.',
  extrude: 'Vedä ylös tai anna levyn paksuus. Hyväksy pursotus.',
  move: 'Vedä kappaletta tai anna siirtymä. Hyväksy uusi sijainti.',
  navigate: 'Vedä yhdellä sormella kiertääksesi. Kahdella sormella panoroit ja zoomaat.',
};
type Fields = { width: string; depth: string; height: string; x: string; y: string; z: string };
const defaults: Fields = { width: '600', depth: '400', height: '18', x: '0', y: '0', z: '0' };

function IconButton({
  children,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      className={`icon-button ${props.className ?? ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
function MeasureField({
  label,
  value,
  onChange,
  testId,
  signed = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  signed?: boolean;
}) {
  const inputId = useId();
  return (
    <div className="measure-field">
      <label htmlFor={inputId}>{label}</label>
      <div>
        {signed && (
          <button
            type="button"
            className="sign-toggle"
            aria-label={`Vaihda etumerkki: ${label}`}
            onClick={() =>
              onChange(
                value.trim().startsWith('-')
                  ? value.trim().slice(1)
                  : `-${value.trim().replace(/^\+/, '') || '0'}`,
              )
            }
          >
            ±
          </button>
        )}
        <input
          id={inputId}
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
        />
        <span>mm</span>
      </div>
    </div>
  );
}

export default function App() {
  const editor = useEditor();
  const { project, busy, ready } = editor;
  const [selected, setSelected] = useState<string>();
  const [selectedFace, setSelectedFace] = useState<FaceRef>();
  const [tool, setTool] = useState<Tool>('select');
  const [mode, setMode] = useState<'model' | 'drawing'>('model');
  const [fields, setFields] = useState<Fields>(defaults);
  const [draftId, setDraftId] = useState(uid);
  const [axis, setAxis] = useState<Axis>();
  const [gridSnap, setGridSnap] = useState(true);
  const [snapLabel, setSnapLabel] = useState('Ruudukko · 10 mm');
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [view, setView] = useState<View>('iso');
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>();
  const [drawingView, setDrawingView] = useState<DrawingView>('front');
  const [scale, setScale] = useState(5);
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<Sheet>();
  const [panelOpen, setPanelOpen] = useState(true);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<'objects' | 'dimensions'>('objects');
  const fileInput = useRef<HTMLInputElement>(null);
  const body = project.bodies.find((b) => b.id === selected);
  const editing = ['rectangle', 'extrude', 'move'].includes(tool);
  const field = (key: keyof Fields, value: string) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  const select = (id?: string, face?: FaceRef) => {
    setSelected(id);
    setSelectedFace(face);
    setTool('select');
  };
  const fit = () => setCameraCommand({ id: performance.now(), type: 'fit' });
  const changeView = (next: View) => {
    setView(next);
    setProjection(next === 'iso' ? 'perspective' : 'orthographic');
    setCameraCommand({ id: performance.now(), type: 'view', view: next });
  };
  const begin = (next: Tool) => {
    if (busy) return;
    if ((next === 'extrude' || next === 'move') && !body) {
      editor.setMessage('Valitse ensin kappale.');
      return;
    }
    setTool(next);
    setMode('model');
    editor.setError('');
    if (['rectangle', 'extrude', 'move'].includes(next)) {
      setPanelOpen(true);
      setDraftId(uid());
      setFields({ ...defaults, height: String(body?.feature.height || 18) });
      if (next === 'rectangle') {
        setSelected(undefined);
        setSelectedFace(undefined);
        if (view !== 'iso' && view !== 'top') changeView('top');
      }
    }
  };
  const makePreview = (): Body | undefined => {
    if (!editing) return;
    if (tool === 'rectangle') {
      return {
        ...makeBody(
          parseLength(fields.width),
          parseLength(fields.depth),
          0,
          [parseLength(fields.x, true, true), parseLength(fields.y, true, true), 0],
          `Levy ${project.bodies.length + 1}`,
        ),
        id: draftId,
      };
    }
    if (!body) return;
    if (tool === 'extrude')
      return { ...body, feature: { ...body.feature, height: parseLength(fields.height) } };
    return {
      ...body,
      origin: body.origin.map(
        (n, i) => n + parseLength(fields[(['x', 'y', 'z'] as const)[i]], true, true),
      ) as Vec3,
    };
  };
  const preview = useMemo(() => {
    try {
      return makePreview();
    } catch {
      return undefined;
    }
  }, [tool, fields, body, draftId, project.bodies.length]);

  const apply = async () => {
    try {
      const candidate = makePreview();
      if (!candidate) return;
      const next = {
        ...project,
        bodies:
          tool === 'rectangle'
            ? [...project.bodies, candidate]
            : project.bodies.map((b) => (b.id === candidate.id ? candidate : b)),
      };
      if (
        await editor.transact(
          next,
          tool === 'rectangle'
            ? 'Suorakulmio valmis. Anna sille paksuus Push / pull -työkalulla.'
            : 'Muokkaus valmis.',
        )
      ) {
        setSelected(candidate.id);
        setSelectedFace(undefined);
        setTool('select');
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const cancel = () => {
    if (busy) editor.cancel();
    setTool('select');
    editor.setError('');
  };
  const removeBody = async () => {
    if (!body) return;
    if (
      await editor.transact(
        { ...project, bodies: project.bodies.filter((b) => b.id !== body.id) },
        'Kappale poistettu. Voit perua poiston.',
      )
    )
      select();
  };
  const copyBody = async () => {
    if (!body) return;
    const copy = {
      ...body,
      id: uid(),
      name: `${body.name.slice(0, 110)} kopio`,
      origin: [body.origin[0] + body.feature.width + 50, body.origin[1], body.origin[2]] as Vec3,
    };
    if (
      await editor.transact(
        { ...project, bodies: [...project.bodies, copy] },
        'Itsenäinen kopio lisätty.',
      )
    )
      select(copy.id);
  };
  const newProject = async () => {
    if (
      await editor.transact(
        freshProject(),
        'Uusi projekti. Aiemman työn saat takaisin Peru-toiminnolla.',
      )
    ) {
      select();
      setMode('model');
    }
  };
  const example = async () => {
    if (
      await editor.transact(
        cabinetProject(),
        'Esimerkkikaappi avattu. Jokainen levy on erillinen muokattava kappale.',
      )
    ) {
      select();
      setMode('model');
      changeView('iso');
    }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error('Projektitiedosto on liian suuri (enintään 10 Mt).');
      const loaded = parseProject(await file.text());
      if (await editor.transact(loaded, 'Projekti avattu.')) {
        select();
        setMode('model');
        changeView('iso');
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const openDrawing = () => {
    setTool('select');
    setMode('drawing');
    setTab('dimensions');
    setScale(recommendedScale(project, drawingView));
  };
  const addDimension = async (axis: Axis) => {
    if (!body) return;
    if (project.dimensions.some((d) => d.bodyId === body.id && d.axis === axis)) {
      editor.setMessage('Tämä mitta on jo lisätty.');
      return;
    }
    await editor.transact(
      {
        ...project,
        dimensions: [
          ...project.dimensions,
          { id: uid(), bodyId: body.id, axis, from: 'min', to: 'max' },
        ],
      },
      'Malliin liittyvä mitta lisätty.',
    );
  };
  const onSheet = useCallback((sheet?: Sheet) => setSheet(sheet), []);

  useEffect(() => {
    if (selected && !project.bodies.some((b) => b.id === selected)) {
      setSelected(undefined);
      setSelectedFace(undefined);
    }
  }, [project.bodies, selected]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        downloadFile(
          JSON.stringify(project, null, 2),
          `${safeFilename(project.name)}.nivo`,
          'application/json',
        );
        return;
      }
      if (key === 'escape') {
        cancel();
        return;
      }
      if (busy) return;
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        setTool('select');
        if (event.shiftKey) void editor.redo();
        else void editor.undo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'enter' && editing) {
        event.preventDefault();
        void apply();
      }
      const chosen = tools.find((t) => t.shortcut.toLowerCase() === key);
      if (chosen) begin(chosen.id);
      if (tool === 'move' && ['x', 'y', 'z'].includes(key))
        setAxis(axis === key ? undefined : (key as Axis));
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        void removeBody();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setHelp(true);
          }}
          aria-label="Tietoa Nivosta"
        >
          <img src="/nivo.svg" alt="" />
          <span>
            nivo<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-heading">
          <input
            aria-label="Projektin nimi"
            key={project.id + project.name}
            defaultValue={project.name}
            maxLength={120}
            disabled={busy}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== project.name)
                void editor.transact({ ...project, name }, 'Projekti nimetty.');
              else e.target.value = project.name;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span className="save-status">
            <span
              className={
                editor.saveStatus.includes('epäonnistui') ? 'status-dot error' : 'status-dot'
              }
            />
            {editor.saveStatus || 'Valmistellaan…'}
          </span>
        </div>
        <div className="header-actions">
          <IconButton label="Uusi projekti" disabled={busy} onClick={() => void newProject()}>
            <FilePlus2 />
          </IconButton>
          <IconButton
            label="Avaa projektitiedosto"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen />
          </IconButton>
          <button
            className="button dark download-project"
            disabled={!ready || busy}
            onClick={() =>
              downloadFile(
                JSON.stringify(project, null, 2),
                `${safeFilename(project.name)}.nivo`,
                'application/json',
              )
            }
          >
            <Download size={17} />
            <span>Tallenna tiedosto</span>
          </button>
          <IconButton label="Käyttöohje" onClick={() => setHelp(true)}>
            <CircleHelp />
          </IconButton>
        </div>
        <input
          ref={fileInput}
          data-testid="project-file"
          type="file"
          accept=".nivo,.json,application/json"
          hidden
          onChange={(e) => void importProject(e.target.files?.[0])}
        />
      </header>

      <div className="workspace-bar">
        <div className="mode-switch" aria-label="Työtila">
          <button aria-pressed={mode === 'model'} onClick={() => setMode('model')}>
            <Box size={16} />
            Malli
          </button>
          <button
            aria-pressed={mode === 'drawing'}
            disabled={!project.bodies.length || busy}
            onClick={openDrawing}
          >
            <Ruler size={16} />
            Mittakuva
          </button>
        </div>
        <div className="bar-center">
          <span className="tiny-dot" />
          OMA TYÖTILA <span className="bar-separator">/</span>
          <span>{mode === 'model' ? '3D-suunnittelu' : 'Tekninen piirustus'}</span>
        </div>
        <div className="history-controls">
          <IconButton
            label="Peru"
            disabled={busy || !editor.canUndo}
            onClick={() => {
              setTool('select');
              void editor.undo();
            }}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="Palauta"
            disabled={busy || !editor.canRedo}
            onClick={() => {
              setTool('select');
              void editor.redo();
            }}
          >
            <Redo2 />
          </IconButton>
          <span className="vertical-rule" />
          <IconButton
            label={panelOpen ? 'Piilota ominaisuudet' : 'Näytä ominaisuudet'}
            aria-pressed={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </IconButton>
        </div>
      </div>

      <div className={`workspace ${panelOpen ? 'panel-open' : ''}`}>
        <aside className="tool-rail" aria-label="Mallinnustyökalut">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-button ${mode === 'model' && tool === t.id ? 'active' : ''}`}
              aria-label={t.label}
              aria-pressed={mode === 'model' && tool === t.id}
              disabled={busy || (['extrude', 'move'].includes(t.id) && !body)}
              onClick={() => begin(t.id)}
              title={`${t.label} (${t.shortcut})`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <div className="rail-divider" />
          <button
            className={`tool-button ${mode === 'drawing' ? 'active' : ''}`}
            aria-label="Luo mittakuva"
            disabled={!project.bodies.length || busy}
            onClick={openDrawing}
          >
            <Ruler />
            <span>Mitoita</span>
          </button>
          <div className="rail-spacer" />
          <span className="rail-unit">mm</span>
        </aside>

        <main className="canvas-area">
          <div className="canvas-topbar">
            <div className="view-tabs" aria-label="Näkymät">
              {mode === 'model'
                ? (
                    [
                      ['iso', '3D'],
                      ['front', 'Edestä'],
                      ['right', 'Sivulta'],
                      ['top', 'Ylhäältä'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} aria-pressed={view === id} onClick={() => changeView(id)}>
                      {label}
                    </button>
                  ))
                : (
                    [
                      ['front', 'Etukuva'],
                      ['right', 'Sivukuva'],
                      ['top', 'Yläkuva'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={drawingView === id}
                      onClick={() => {
                        setDrawingView(id);
                        setScale(recommendedScale(project, id));
                      }}
                    >
                      {label}
                    </button>
                  ))}
            </div>
            {mode === 'model' ? (
              <div className="view-actions">
                <button
                  className="projection-button"
                  onClick={() => {
                    const next = projection === 'perspective' ? 'orthographic' : 'perspective';
                    setProjection(next);
                    setCameraCommand({
                      id: performance.now(),
                      type: 'projection',
                      projection: next,
                    });
                  }}
                >
                  {projection === 'perspective' ? 'Perspektiivi' : 'Rinnakkaisprojektio'}
                  <ArrowLeftRight size={14} />
                </button>
                <IconButton label="Sovita näkymään" onClick={fit}>
                  <Maximize />
                </IconButton>
              </div>
            ) : (
              <div className="view-actions">
                <label className="scale-select">
                  Mittakaava
                  <select
                    aria-label="Mittakaava"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                  >
                    {[1, 2, 5, 10, 20, 50, 100, 500, 1000].map((s) => (
                      <option key={s} value={s}>
                        1:{s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="model-stage" hidden={mode !== 'model'}>
            <Viewport
              bodies={project.bodies}
              meshes={editor.meshes}
              selected={selected}
              selectedFace={selectedFace}
              tool={tool}
              preview={preview}
              axis={axis}
              gridSnap={gridSnap}
              busy={busy}
              command={cameraCommand}
              onSelect={select}
              onSnap={setSnapLabel}
              onRectangle={(origin, width, depth) =>
                setFields((previous) => ({
                  ...previous,
                  width: String(width),
                  depth: String(depth),
                  x: String(origin[0]),
                  y: String(origin[1]),
                }))
              }
              onMove={(origin) => {
                if (body)
                  setFields((previous) => ({
                    ...previous,
                    x: String(origin[0] - body.origin[0]),
                    y: String(origin[1] - body.origin[1]),
                    z: String(origin[2] - body.origin[2]),
                  }));
              }}
              onExtrude={(height) => field('height', String(height))}
            />
            {!project.bodies.length && !editing && (
              <div className="welcome">
                <span className="eyebrow">TILAA AJATUKSILLE</span>
                <h1>
                  Ideasta
                  <br />
                  <em>muotoon.</em>
                </h1>
                <p>
                  Piirrä ensimmäinen levy.
                  <br />
                  Tarkat mitat, selkeä kokonaisuus.
                </p>
                <button className="button dark" disabled={busy} onClick={() => begin('rectangle')}>
                  <Plus size={18} />
                  Piirrä suorakulmio
                </button>
                <button className="welcome-example" disabled={busy} onClick={() => void example()}>
                  Tai avaa esimerkkikaappi <span>↗</span>
                </button>
                <div className="welcome-meta">
                  <span>01 — Piirrä</span>
                  <span>02 — Muotoile</span>
                  <span>03 — Mitoita</span>
                </div>
              </div>
            )}
            <div className="canvas-corner">
              <span className="axis-chip x">X</span>
              <span className="axis-chip y">Y</span>
              <span className="axis-chip z">Z</span>
              <span>Millimetrit</span>
            </div>
            <div className="canvas-bottom-actions">
              <button
                aria-pressed={gridSnap}
                onClick={() => {
                  setGridSnap(!gridSnap);
                  setSnapLabel(!gridSnap ? 'Ruudukko · 10 mm' : 'Geometriatartunnat');
                }}
              >
                <Grid2X2 size={15} />
                {gridSnap ? 'Tartunta 10 mm' : 'Ruudukko pois'}
              </button>
            </div>
          </div>
          {mode === 'drawing' && (
            <DrawingPanel
              project={project}
              cad={editor.cad}
              view={drawingView}
              scale={scale}
              hidden={hidden}
              onSheet={onSheet}
            />
          )}

          {busy && (
            <div className="busy-badge" role="status">
              <LoaderCircle className="spin" size={16} />
              {ready ? 'Lasketaan geometriaa' : 'Avataan työtilaa'}
              <button onClick={editor.cancel}>Peru</button>
            </div>
          )}
          {editor.error && (
            <div className="error-toast" role="alert">
              <XCircle size={18} />
              <span>{editor.error}</span>
              <IconButton label="Sulje virheilmoitus" onClick={() => editor.setError('')}>
                <X size={16} />
              </IconButton>
            </div>
          )}
        </main>

        {panelOpen && (
          <aside className="inspector" aria-label="Ominaisuudet">
            {editing ? (
              <>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">TYÖKALU</span>
                    <h2>
                      {tool === 'rectangle'
                        ? 'Suorakulmio'
                        : tool === 'extrude'
                          ? 'Anna paksuus'
                          : 'Siirrä kappaletta'}
                    </h2>
                  </div>
                  <span className="step-number">{tool === 'rectangle' ? '01' : '02'}</span>
                </div>
                <p className="panel-description">
                  {tool === 'rectangle'
                    ? 'Mitat millimetreinä. Voit kirjoittaa myös esimerkiksi 2,4 m.'
                    : tool === 'extrude'
                      ? 'Esikatselu näyttää uuden paksuuden. Muutos tehdään vasta hyväksyttäessä.'
                      : 'Anna siirtymä nykyisestä sijainnista tai vedä kappaletta näkymässä.'}
                </p>
                <div className="tool-fields">
                  {tool === 'rectangle' && (
                    <>
                      <MeasureField
                        label="Leveys · X"
                        value={fields.width}
                        testId="width-input"
                        onChange={(v) => field('width', v)}
                      />
                      <MeasureField
                        label="Syvyys · Y"
                        value={fields.depth}
                        testId="depth-input"
                        onChange={(v) => field('depth', v)}
                      />
                      <div className="plane-note">
                        <Grid2X2 size={16} />
                        <span>
                          Piirtotaso <strong>XY</strong>
                        </span>
                      </div>
                    </>
                  )}
                  {tool === 'extrude' && (
                    <MeasureField
                      label="Paksuus · Z"
                      value={fields.height}
                      testId="height-input"
                      onChange={(v) => field('height', v)}
                    />
                  )}
                  {tool === 'move' && (
                    <>
                      {(['x', 'y', 'z'] as const).map((a) => (
                        <MeasureField
                          key={a}
                          signed
                          label={`Siirtymä · ${a.toUpperCase()}`}
                          value={fields[a]}
                          testId={`move-${a}`}
                          onChange={(v) => field(a, v)}
                        />
                      ))}
                      <span className="field-caption">Lukitse vetosuunta</span>
                      <div className="axis-locks">
                        {(['x', 'y', 'z'] as const).map((a) => (
                          <button
                            key={a}
                            aria-label={`Lukitse ${a.toUpperCase()}-akseli`}
                            aria-pressed={axis === a}
                            onClick={() => setAxis(axis === a ? undefined : a)}
                          >
                            {a.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="apply-actions">
                  <button className="button dark" disabled={busy} onClick={() => void apply()}>
                    <Check size={18} />
                    Hyväksy
                  </button>
                  <button className="button subtle" onClick={cancel}>
                    <X size={18} />
                    Peruuta
                  </button>
                </div>
                <div className="tool-tip">
                  <span className="tiny-dot" />
                  {snapLabel}
                </div>
              </>
            ) : (
              <>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">{body ? 'VALINTA' : 'PROJEKTI'}</span>
                    <h2>{body ? body.name : 'Kokonaisuus'}</h2>
                  </div>
                  <Box size={21} />
                </div>
                {body ? (
                  <div className="selection-info">
                    <span className="selection-tag">
                      {body.feature.height ? 'CAD-kappale' : 'Tasoluonnos'}
                      {selectedFace ? ` · ${faceNames[selectedFace]}` : ''}
                    </span>
                    <div className="dimensions-grid">
                      <div>
                        <span>Leveys</span>
                        <strong>
                          {formatLength(body.feature.width)}
                          <small>mm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Syvyys</span>
                        <strong>
                          {formatLength(body.feature.depth)}
                          <small>mm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Paksuus</span>
                        <strong data-testid="selected-height">
                          {formatLength(body.feature.height)}
                          <small>mm</small>
                        </strong>
                      </div>
                    </div>
                    <p className="origin-readout">
                      X {formatLength(body.origin[0])} · Y {formatLength(body.origin[1])} · Z{' '}
                      {formatLength(body.origin[2])}
                    </p>
                    {mode === 'model' && (
                      <>
                        <button
                          className="button outlined full"
                          disabled={busy}
                          onClick={() => begin('extrude')}
                        >
                          <ArrowUpFromLine size={17} />
                          {body.feature.height ? 'Muuta paksuutta' : 'Anna paksuus'}
                        </button>
                        <div className="selection-actions">
                          <IconButton
                            label="Siirrä valittua"
                            disabled={busy}
                            onClick={() => begin('move')}
                          >
                            <Move3D />
                          </IconButton>
                          <IconButton
                            label="Kopioi kappale"
                            disabled={busy}
                            onClick={() => void copyBody()}
                          >
                            <Copy />
                          </IconButton>
                          <IconButton
                            label="Poista kappale"
                            disabled={busy}
                            onClick={() => void removeBody()}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="panel-description">
                    {project.bodies.length
                      ? 'Valitse kappale näkymästä tai alla olevasta listasta.'
                      : 'Jokainen hyvä suunnitelma alkaa yhdestä muodosta.'}
                  </p>
                )}

                {mode === 'drawing' && (
                  <div className="drawing-options">
                    <h3>Lisää mitta</h3>
                    <p className="muted">
                      {body ? `Valittu: ${body.name}` : 'Valitse ensin kappale listasta.'}
                    </p>
                    <div className="dimension-buttons">
                      <button
                        className="button outlined"
                        disabled={!body || busy}
                        onClick={() => void addDimension(drawingView === 'right' ? 'y' : 'x')}
                      >
                        <ArrowLeftRight size={16} />
                        {drawingView === 'right' ? 'Syvyys' : 'Leveys'}
                      </button>
                      <button
                        className="button outlined"
                        disabled={!body || busy || (drawingView !== 'top' && !body?.feature.height)}
                        onClick={() => void addDimension(drawingView === 'top' ? 'y' : 'z')}
                      >
                        <Ruler size={16} />
                        {drawingView === 'top' ? 'Syvyys' : 'Korkeus'}
                      </button>
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={hidden}
                        onChange={(e) => setHidden(e.target.checked)}
                      />
                      Näytä piiloviivat
                    </label>
                    <button
                      className="button dark full"
                      disabled={!sheet?.fits || !!sheet.orphanCount || busy}
                      onClick={() =>
                        sheet &&
                        downloadFile(
                          sheet.svg,
                          `${safeFilename(project.name)}-${drawingView}.svg`,
                          'image/svg+xml',
                        )
                      }
                    >
                      <ArrowDownToLine size={17} />
                      Vie SVG-mittakuva
                    </button>
                    <p className="export-note">
                      A4 vaaka · vektorigrafiikka
                      <br />
                      Tulosta 100 % koossa.
                    </p>
                  </div>
                )}

                <div className="object-panel">
                  <div className="panel-tabs">
                    <button aria-pressed={tab === 'objects'} onClick={() => setTab('objects')}>
                      Kappaleet <span>{project.bodies.length}</span>
                    </button>
                    <button
                      aria-pressed={tab === 'dimensions'}
                      onClick={() => setTab('dimensions')}
                    >
                      Mitat <span>{project.dimensions.length}</span>
                    </button>
                  </div>
                  {tab === 'objects' ? (
                    <div className="object-list">
                      {project.bodies.length ? (
                        project.bodies.map((b) => (
                          <button
                            key={b.id}
                            data-testid={`body-${b.id}`}
                            className={selected === b.id ? 'selected' : ''}
                            onClick={() => select(b.id)}
                          >
                            <Box size={16} />
                            <span>{b.name}</span>
                            <small>{b.feature.height ? '3D' : '2D'}</small>
                          </button>
                        ))
                      ) : (
                        <div className="empty-list">
                          <Layers2 size={26} />
                          <p>
                            Tyhjä kangas.
                            <br />
                            Sinun seuraava ideasi.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="dimension-list">
                      {project.dimensions.length ? (
                        project.dimensions.map((d) => {
                          const value = dimensionValue(project, d);
                          return (
                            <div key={d.id} className={value === null ? 'broken' : ''}>
                              <button onClick={() => select(d.bodyId)}>
                                <Ruler size={15} />
                                <span>
                                  {value === null
                                    ? 'Viite puuttuu'
                                    : `${d.axis.toUpperCase()} · ${formatLength(value)} mm`}
                                  <small>
                                    {project.bodies.find((b) => b.id === d.bodyId)?.name ??
                                      'Poistettu kappale'}
                                  </small>
                                </span>
                              </button>
                              <IconButton
                                label="Poista mitta"
                                disabled={busy}
                                onClick={() =>
                                  void editor.transact(
                                    {
                                      ...project,
                                      dimensions: project.dimensions.filter((m) => m.id !== d.id),
                                    },
                                    'Mitta poistettu.',
                                  )
                                }
                              >
                                <X size={15} />
                              </IconButton>
                            </div>
                          );
                        })
                      ) : (
                        <div className="empty-list">
                          <Ruler size={26} />
                          <p>
                            Lisää ensimmäinen mitta
                            <br />
                            Mittakuva-työtilassa.
                          </p>
                        </div>
                      )}
                      {mode === 'drawing' && (
                        <button className="button subtle full" onClick={() => setTab('objects')}>
                          <Box size={16} />
                          Valitse kappale
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="panel-footer">
                  <span className="tiny-dot" />
                  <span>
                    {project.bodies.length} kappaletta · {project.dimensions.length} mittaa
                  </span>
                  <span>v0.1</span>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <footer className="status-bar">
        <div>
          <span className="status-icon">
            {busy ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}
          </span>
          <span role="status">
            {editing || tool === 'navigate' ? instructions[tool] : editor.message}
          </span>
        </div>
        <span className="status-right">
          {mode === 'model' ? 'XY · Z ylöspäin' : 'A4 · Ortografinen'}
          <span className="status-divider" />1 yksikkö = 1 mm
        </span>
      </footer>

      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton label="Sulje ohje" className="modal-close" onClick={() => setHelp(false)}>
              <X />
            </IconButton>
            <span className="eyebrow">TERVETULOA NIVOON</span>
            <h2 id="help-title">
              Pienestä muodosta
              <br />
              valmiiksi suunnitelmaksi.
            </h2>
            <ol>
              <li>
                <strong>Piirrä.</strong> Valitse Suorakulmio. Vedä XY-tasolle tai anna leveys ja
                syvyys. Hyväksy.
              </li>
              <li>
                <strong>Muotoile.</strong> Valitse Push / pull ja anna paksuus. Siirrä ja kopioi
                levyjä.
              </li>
              <li>
                <strong>Mitoita.</strong> Avaa Mittakuva, valitse kappale ja lisää mitat. Vie SVG.
              </li>
            </ol>
            <p>
              <strong>Kosketus:</strong> napautus valitsee, yksi sormi käyttää työkalua. Kaksi
              sormea panoroi ja zoomaa. Navigoi-työkalulla yksi sormi kiertää.
            </p>
            <p>
              <strong>Hiiri:</strong> oikea painike kiertää, keskipainike panoroi ja rulla zoomaa.
              Navigoi-työkalulla myös vasen painike kiertää.
            </p>
            <p>
              <strong>Säilytä työsi:</strong> automaattitallennus palauttaa työn tässä selaimessa.
              Lataa lisäksi .nivo-projektitiedosto omalle laitteellesi.
            </p>
            <p className="muted">
              Ensimmäinen versio tukee suorakulmaisia levyjä. Komponentit, pintaan piirtäminen,
              materiaalit ja laajempi mallinnus tulevat myöhemmissä vaiheissa.
            </p>
            <a href="https://github.com/alluharju-bot/nivo" target="_blank" rel="noreferrer">
              Avoin lähdekoodi ↗
            </a>
            <a
              className="license-link"
              href="/licenses/NOTICE.txt"
              target="_blank"
              rel="noreferrer"
            >
              Kirjastot ja lisenssit ↗
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
