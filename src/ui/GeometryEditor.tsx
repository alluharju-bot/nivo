import { flushSync } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Quaternion, Vector3 } from 'three';
import { Crosshair } from 'lucide-react';
import type { GeometryStageProps } from '../viewport/GeometryStage';
import {
  geometryMatrix,
  selectionCenter,
  type EditableGeometry,
  type GeometryOperation,
  type GeometrySelection,
} from '../model/geometryEditing';
import { parseLength } from '../model/units';
import type { Body, Vec3 } from '../model/project';
import type { CadClient } from '../cad/client';
import { geometryInfluence, transformWithInfluence } from '../model/geometryInfluence';
import { retessellateGeometry } from '../model/geometryRetessellation';

export interface GeometrySession {
  pending: boolean;
  finish: () => Promise<boolean>;
  cancel: () => boolean;
}
interface Props {
  body: Body;
  cad: CadClient;
  linkedCount: number;
  lockedCopies: number;
  busy: boolean;
  error: string;
  selection: GeometrySelection;
  operation: GeometryOperation;
  keyboardInput: boolean;
  onInput: () => void;
  gridStep: number;
  gridSnap: boolean;
  session: MutableRefObject<GeometrySession | undefined>;
  onStage: (props?: GeometryStageProps) => void;
  onCommit: (points: Vec3[], meshCopy: boolean, unique: boolean) => Promise<boolean>;
}
const defaults = (operation: GeometryOperation) =>
  operation === 'scale' ? ['100', '100', '100'] : ['0', '0', '0'];
const identity: [number, number, number, number] = [0, 0, 0, 1];
type ShapingPreferences = { soft: boolean; radius: string; pinBoundaries: boolean };
export function GeometryEditor(props: Props) {
  const { body, cad, session, onStage } = props;
  const [prepared, setPrepared] = useState<{
    body: Body;
    geometry: EditableGeometry;
    serial: number;
  }>();
  const [loadError, setLoadError] = useState('');
  const remembered = useRef<Vec3[]>([]);
  const shaping = useRef<ShapingPreferences>({ soft: false, radius: '20', pinBoundaries: true });
  useEffect(() => {
    let current = true;
    setLoadError('');
    void cad
      .prepareGeometry(body)
      .then((geometry) => {
        if (current) setPrepared((old) => ({ body, geometry, serial: (old?.serial ?? 0) + 1 }));
      })
      .catch((e: Error) => {
        if (current) setLoadError(e.message);
      });
    return () => {
      current = false;
    };
  }, [body, cad]);
  useEffect(
    () => () => {
      session.current = undefined;
      onStage(undefined);
    },
    [session, onStage],
  );
  if (prepared?.body !== body)
    return (
      <section className="precision-settings" aria-label="Geometriamuutoksen asetukset">
        <p role={loadError ? 'alert' : 'status'}>{loadError || 'Valmistellaan geometriaa…'}</p>
      </section>
    );
  return (
    <GeometryEditorReady
      key={prepared.serial}
      {...props}
      geometry={prepared.geometry}
      remembered={remembered}
      shaping={shaping}
    />
  );
}
function GeometryEditorReady({
  body,
  geometry: g,
  linkedCount,
  lockedCopies,
  busy,
  error,
  selection: mode,
  operation,
  keyboardInput,
  onInput,
  gridStep,
  gridSnap,
  session,
  onStage,
  onCommit,
  remembered,
  shaping,
}: Props & {
  geometry: EditableGeometry;
  remembered: MutableRefObject<Vec3[]>;
  shaping: MutableRefObject<ShapingPreferences>;
}) {
  const meshCopy = !g.exact && body.feature.type !== 'mesh';
  const [copyAccepted, setCopyAccepted] = useState(false),
    [unique, setUnique] = useState(false);
  const [selected, setSelected] = useState<number[]>(() =>
    g.points.flatMap((p, i) =>
      remembered.current.some((q) => Math.hypot(...p.map((n, k) => n - q[k])) < 1e-6) ? [i] : [],
    ),
  );
  const [values, setValues] = useState(defaults(operation));
  const [soft, setSoft] = useState(shaping.current.soft),
    [radius, setRadius] = useState(shaping.current.radius),
    [pinBoundaries, setPinBoundaries] = useState(shaping.current.pinBoundaries);
  useEffect(() => {
    shaping.current = { soft, radius, pinBoundaries };
  }, [shaping, soft, radius, pinBoundaries]);
  const shapingInput = useMemo(() => {
    try {
      return { radius: soft ? parseLength(radius, false, true) : 0, error: '' };
    } catch (e) {
      return { radius: 0, error: (e as Error).message };
    }
  }, [soft, radius]);
  const softRadius = shapingInput.radius;
  const influence = useMemo(
    () => geometryInfluence(g, selected, softRadius, pinBoundaries),
    [g, selected, softRadius, pinBoundaries],
  );
  const [axes, setAxes] = useState<[boolean, boolean, boolean]>([true, true, true]);
  const [uniform, setUniform] = useState(true),
    [local, setLocal] = useState(false),
    [xray, setXray] = useState(false),
    [allEdges, setAllEdges] = useState(false);
  const [customPivot, setCustomPivot] = useState<Vec3>(),
    [picking, setPicking] = useState<'pivot' | 'reference'>();
  const [drag, setDrag] = useState<Vec3[]>(),
    [stageError, setStageError] = useState('');
  const committing = useRef(false);
  const [cancelToken, setCancelToken] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const base = g.points;
  const frame = local
    ? (body.textureFrame?.rotation ?? body.component?.rotation ?? identity)
    : identity;
  const pivot = customPivot ?? selectionCenter(base, selected);
  const ready = !meshCopy || copyAccepted;
  const numeric = useMemo(() => {
    try {
      if (shapingInput.error) throw new Error(shapingInput.error);
      const v = values.map((s, i) => {
        if (!axes[i]) return operation === 'scale' ? 1 : 0;
        if (operation === 'move') return parseLength(s.trim() || '0', true, true);
        const text =
          (operation === 'scale' && uniform ? values[0] : s)
            .replace(',', '.')
            .replace(/[°%]/g, '')
            .trim() || '0';
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('Anna mitat numeroina.');
        return Number(text) / (operation === 'scale' ? 100 : 1);
      }) as Vec3;
      return {
        points: transformWithInfluence(base, influence, geometryMatrix(operation, v, pivot, frame)),
        error: '',
      };
    } catch (e) {
      return { points: base, error: (e as Error).message };
    }
  }, [
    base,
    selected,
    influence,
    shapingInput.error,
    values,
    axes,
    operation,
    uniform,
    pivot.join(','),
    frame.join(','),
  ]);
  const points = drag ?? numeric.points;
  const topology = useMemo(() => {
    try {
      return { geometry: retessellateGeometry(g, points), error: '' };
    } catch (e) {
      return { geometry: g, error: (e as Error).message };
    }
  }, [g, points]);
  const changed = points.some((p, i) => p.some((n, k) => Math.abs(n - base[i][k]) > 1e-8));
  const pending = changed || !!numeric.error;
  const reset = () => {
    setCancelToken((n) => n + 1);
    setValues(defaults(operation));
    setDrag(undefined);
    setStageError('');
    setPicking(undefined);
  };
  const cancel = () => {
    if (picking) {
      setPicking(undefined);
      return true;
    }
    if (pending || stageError) {
      reset();
      return true;
    }
    if (selected.length) {
      setSelected([]);
      remembered.current = [];
      return true;
    }
    return false;
  };
  const finish = async (next = points) => {
    const hasChanges = next.some((p, i) => p.some((n, k) => Math.abs(n - base[i][k]) > 1e-8));
    if (numeric.error || topology.error) return false;
    if (!hasChanges) return true;
    if (!ready || busy || committing.current || (lockedCopies && !unique && !meshCopy))
      return false;
    committing.current = true;
    remembered.current = selected.map((i) => next[i]);
    try {
      return await onCommit(next, meshCopy, unique);
    } finally {
      committing.current = false;
    }
  };
  const live = useRef({
    finish,
    cancel,
    pending,
    busy,
    picking,
    keyboardInput,
    onInput,
    selected,
    axes,
    values,
    operation,
    uniform,
  });
  live.current = {
    finish,
    cancel,
    pending,
    busy,
    picking,
    keyboardInput,
    onInput,
    selected,
    axes,
    values,
    operation,
    uniform,
  };
  useLayoutEffect(() => {
    session.current = {
      pending,
      finish: () => live.current.finish(),
      cancel: () => live.current.cancel(),
    };
    return () => {
      session.current = undefined;
    };
  }, [session, pending]);
  useEffect(() => {
    reset();
  }, [operation]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (live.current.busy || event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      const text = target.closest('input,select,textarea,[contenteditable]');
      const key = event.key.toLowerCase();
      if (key === 'escape' && live.current.cancel()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (key === 'enter' && !text && !target.closest('button,a,summary')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void live.current.finish();
      } else if ((event.ctrlKey || event.metaKey) && key === 'z' && !text && live.current.pending) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.shiftKey) live.current.cancel();
      } else if (
        !text &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        live.current.keyboardInput &&
        /^[\d.,+\-]$/.test(key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const state = live.current;
        if (!state.selected.length) {
          setStageError('Valitse ensin piste, reuna tai pinta.');
          return;
        }
        const active = state.axes.flatMap((on, i) => (on ? [i] : []));
        const index =
          state.operation === 'scale' && state.uniform
            ? 0
            : active.sort(
                (a, b) => Math.abs(Number(state.values[b])) - Math.abs(Number(state.values[a])),
              )[0];
        if (index === undefined) return;
        const value =
          state.operation === 'move' && Number(state.values[index]) < 0 && /^[\d.,]$/.test(key)
            ? `-${key}`
            : key;
        flushSync(() => {
          state.onInput();
          setCancelToken((n) => n + 1);
          setDrag(undefined);
          setValues((old) => old.map((v, i) => (i === index ? value : v)));
        });
        const input = inputRefs.current[index];
        input?.focus();
        input?.setSelectionRange(value.length, value.length);
      } else if (
        !text &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        ['x', 'y', 'z'].includes(key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setAxes([key === 'x', key === 'y', key === 'z']);
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);
  const select = (ids: number[], extend: boolean) => {
    if (pending) {
      setStageError('Hyväksy muutos Enterillä tai peru Escillä ennen valinnan vaihtamista.');
      return;
    }
    setSelected((old) =>
      extend
        ? ids.every((i) => old.includes(i))
          ? old.filter((i) => !ids.includes(i))
          : [...new Set([...old, ...ids])]
        : ids,
    );
  };
  const pick = (point: Vec3) => {
    if (picking === 'pivot') setCustomPivot(point);
    else {
      const delta = new Vector3(...point)
        .sub(new Vector3(...pivot))
        .applyQuaternion(new Quaternion(...frame).invert());
      setValues(delta.toArray().map((n, i) => (axes[i] ? String(n) : '0')));
    }
    setPicking(undefined);
  };
  useLayoutEffect(() => {
    onStage(
      ready
        ? {
            bodyId: body.id,
            cancelToken,
            geometry: g,
            topology: topology.geometry,
            influence,
            softRadius,
            pinBoundaries,
            points,
            selected,
            mode,
            operation,
            pivot,
            frame,
            axes,
            xray,
            allEdges,
            picking,
            snap: gridSnap ? gridStep : 0,
            uniformScale: uniform,
            disabled: busy,
            onSelect: select,
            onPick: pick,
            onTransform: (next, complete) => {
              setDrag(next);
              if (operation === 'move') {
                const index = selected.find((i) =>
                  next[i].some((n, k) => Math.abs(n - base[i][k]) > 1e-8),
                );
                const delta =
                  index === undefined
                    ? new Vector3()
                    : new Vector3(...next[index])
                        .sub(new Vector3(...base[index]))
                        .applyQuaternion(new Quaternion(...frame).invert());
                setValues(delta.toArray().map((n) => String(Math.round(n * 1e6) / 1e6)));
              }
              if (complete) void live.current.finish(next);
            },
            onError: setStageError,
          }
        : undefined,
    );
  }, [
    g,
    topology,
    influence,
    softRadius,
    pinBoundaries,
    points,
    selected,
    mode,
    operation,
    pivot.join(','),
    frame.join(','),
    axes,
    xray,
    allEdges,
    picking,
    gridSnap,
    gridStep,
    uniform,
    busy,
    ready,
    pending,
    cancelToken,
  ]);
  useLayoutEffect(() => () => onStage(undefined), [onStage]);
  const choosePlane = (axis: number, max: boolean) => {
    const inverse = new Quaternion(...frame).invert(),
      localPoints = base.map((p) => new Vector3(...p).applyQuaternion(inverse).toArray());
    const value = localPoints.reduce(
      (v, p) => (max ? Math.max(v, p[axis]) : Math.min(v, p[axis])),
      max ? -Infinity : Infinity,
    );
    select(
      localPoints.flatMap((p, i) => (Math.abs(p[axis] - value) < 1e-5 ? [i] : [])),
      false,
    );
  };
  if (!ready)
    return (
      <section className="precision-settings" aria-label="Geometriamuutoksen asetukset">
        <h3>Kaarevan pinnan pistemuokkaus</h3>
        <p>
          Vapaa pistemuokkaus tarvitsee verkkokopion. Alkuperäinen tarkka osa säilyy piilotettuna.
          Verkkokopio tukee pistemuokkausta, materiaaleja ja suljetun osan tasopintojen push/pullia.
          Muut CAD-pintatyökalut säilyvät alkuperäisessä osassa.
        </p>
        <button className="button dark full" onClick={() => setCopyAccepted(true)}>
          Muokkaa verkkokopiota
        </button>
        <p className="muted">Voit käyttää muita työkaluja suoraan työkalupalkista.</p>
      </section>
    );
  return (
    <section className="precision-settings" aria-label="Geometriamuutoksen asetukset">
      <header>
        <span className="eyebrow">GEOMETRIA</span>
        <h3>
          {operation === 'move' ? 'Siirrä' : operation === 'rotate' ? 'Kierrä' : 'Skaalaa'} valintaa
        </h3>
        <strong role="status">Valittuna {selected.length} pistettä</strong>
      </header>
      <div className="geometry-selection-actions">
        <button
          disabled={busy || pending}
          onClick={() =>
            select(
              base.map((_, i) => i),
              false,
            )
          }
        >
          Kaikki
        </button>
        <button
          disabled={busy || !selected.length}
          onClick={() => {
            reset();
            setSelected([]);
          }}
        >
          Tyhjennä
        </button>
      </div>
      <div className="geometry-axis-buttons" aria-label="Muokattavat akselit">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <button
            key={axis}
            data-axis={axis.toLowerCase()}
            aria-pressed={axes[i]}
            disabled={busy}
            onClick={() =>
              setAxes((old) => old.map((v, j) => (i === j ? !v : v)) as [boolean, boolean, boolean])
            }
          >
            {axis}
          </button>
        ))}
      </div>
      <fieldset disabled={busy || !selected.length} className="geometry-numeric">
        <legend>
          {operation === 'move'
            ? 'Siirtymä · mm'
            : operation === 'rotate'
              ? 'Kierto · °'
              : 'Skaala · %'}
        </legend>
        {operation !== 'move' &&
          selected.length === 1 &&
          Math.hypot(...base[selected[0]].map((n, i) => n - pivot[i])) < 1e-8 && (
            <p className="muted">Poimi ankkuri eri pisteeseen tai valitse useita pisteitä.</p>
          )}
        {operation === 'scale' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={uniform}
              onChange={(e) => {
                reset();
                setUniform(e.target.checked);
              }}
            />
            Sama kerroin valituilla akseleilla
          </label>
        )}
        {(operation === 'scale' && uniform ? ['Skaala'] : ['X', 'Y', 'Z']).map((axis, i) => (
          <label key={axis}>
            {axis}
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              aria-label={`Geometrian ${operation === 'move' ? 'siirtymä' : operation === 'rotate' ? 'kierto' : 'skaala'} ${axis}`}
              inputMode="decimal"
              value={values[i]}
              disabled={axis !== 'Skaala' && !axes[i]}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                setValues(next);
                setDrag(undefined);
                setStageError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void finish();
                }
              }}
            />
          </label>
        ))}
        <button
          className="button dark full"
          disabled={
            !changed ||
            !!numeric.error ||
            !!topology.error ||
            (!!lockedCopies && !unique && !meshCopy)
          }
          onClick={() => void finish()}
        >
          Toteuta muutos
        </button>
        {pending && (
          <button className="button subtle full" onClick={reset}>
            Peru muutos · Esc
          </button>
        )}
      </fieldset>
      <div className="geometry-pivot-actions">
        <button
          disabled={busy || pending || !selected.length}
          aria-pressed={picking === 'pivot'}
          onClick={() => setPicking(picking === 'pivot' ? undefined : 'pivot')}
        >
          <Crosshair size={15} />
          Poimi ankkuri
        </button>
        <button
          disabled={busy || pending || !selected.length || operation !== 'move'}
          aria-pressed={picking === 'reference'}
          onClick={() => setPicking(picking === 'reference' ? undefined : 'reference')}
        >
          <Crosshair size={15} />
          Poimi viite
        </button>
      </div>
      {picking && (
        <p role="status">
          {picking === 'pivot'
            ? 'Poimi ankkuripiste mallista.'
            : 'Poimi tavoitepiste mallista tai mittaviivasta. Siirtymä seuraa valittuja akseleita.'}
        </p>
      )}
      {customPivot && (
        <button
          className="button subtle full"
          disabled={pending || busy}
          onClick={() => setCustomPivot(undefined)}
        >
          Ankkuri valinnan keskelle
        </button>
      )}
      {(stageError || numeric.error || topology.error || error) && (
        <p role="alert">{stageError || numeric.error || topology.error || error}</p>
      )}
      <details open={soft || undefined}>
        <summary>Pehmeä muotoilu</summary>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={soft}
            disabled={busy || !!drag}
            onChange={(e) => setSoft(e.target.checked)}
          />
          Vaikuta myös lähipisteisiin
        </label>
        {soft && (
          <>
            <label>
              Vaikutusetäisyys · mm
              <input
                aria-label="Muotoilun vaikutusetäisyys"
                inputMode="decimal"
                value={radius}
                disabled={busy || !!drag}
                onChange={(e) => setRadius(e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={pinBoundaries}
                disabled={busy || !!drag}
                onChange={(e) => setPinBoundaries(e.target.checked)}
              />
              Pidä muut reunalenkit paikallaan
            </label>
            <small>
              Vaikutus kulkee pintaa pitkin. Oranssi näyttää valinnan, violetti sen vaikutusalueen.
            </small>
          </>
        )}
      </details>
      <details>
        <summary>Valinta ja tarkkuus</summary>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={local}
            disabled={pending || busy}
            onChange={(e) => setLocal(e.target.checked)}
          />
          Osan omat akselit
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
          Valitse myös takana olevat pisteet
        </label>
        <div className="geometry-plane-buttons">
          {['X', 'Y', 'Z'].flatMap((a, i) =>
            [false, true].map((max) => (
              <button
                key={`${a}${max}`}
                disabled={busy || pending}
                aria-label={`Valitse ${a}${max ? '+' : '−'} tason pisteet`}
                onClick={() => choosePlane(i, max)}
              >
                {a}
                {max ? '+' : '−'}
              </button>
            )),
          )}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={allEdges}
            onChange={(e) => setAllEdges(e.target.checked)}
          />
          Näytä kolmiointi ja sisäpisteet
        </label>
        <small>
          {g.points.length} pistettä · {g.triangles.length / 3} kolmiota.{' '}
          {gridSnap ? `Ruudukko ${gridStep} mm.` : 'Vapaa siirto.'} Kirjoitettu mitta ohittaa
          ruudukon.
        </small>
      </details>
      {!meshCopy && linkedCount > 1 && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={unique}
              disabled={busy}
              onChange={(e) => setUnique(e.target.checked)}
            />
            Muokkaa vain tätä osaa · tee uniikki
          </label>
          {!unique && <p className="muted">Muutos jaetaan {linkedCount} linkitettyyn osaan.</p>}
        </>
      )}
      {!!lockedCopies && !unique && !meshCopy && (
        <p role="alert">
          Linkitetyissä kopioissa on lukittuja osia. Tee tästä osasta uniikki tai vapauta
          lukitukset.
        </p>
      )}
      <p className="muted">
        Shift lisää valintaan. {mode === 'edges' ? 'Tuplaklikkaus valitsee reunalenkin. ' : ''}
        Hyväksytyt muutokset löytyvät projektin historiasta.
      </p>
    </section>
  );
}
