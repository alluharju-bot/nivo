import { useEffect, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';
import { Move, RotateCw, Scaling, Undo2, Redo2, Check, X, Crosshair } from 'lucide-react';
import { SelectionDialog } from './SelectionDialog';
import { GeometryStage } from '../viewport/GeometryStage';
import {
  geometryMatrix,
  selectionCenter,
  transformGeometryPoints,
  type EditableGeometry,
  type GeometryOperation,
  type GeometrySelection,
} from '../model/geometryEditing';
import { parseLength } from '../model/units';
import type { Body, Vec3 } from '../model/project';
import type { CadClient } from '../cad/client';

const defaults = (operation: GeometryOperation) =>
  operation === 'scale' ? ['100', '100', '100'] : ['0', '0', '0'];
const identity: [number, number, number, number] = [0, 0, 0, 1];
export function GeometryEditor({
  body,
  cad,
  linkedCount,
  lockedCopies,
  busy,
  error,
  onCommit,
  onClose,
}: {
  body: Body;
  cad: CadClient;
  linkedCount: number;
  lockedCopies: number;
  busy: boolean;
  error: string;
  onCommit: (points: Vec3[], meshCopy: boolean, unique: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const [data, setData] = useState<EditableGeometry>();
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let current = true;
    void cad
      .prepareGeometry(body)
      .then((g) => {
        if (current) setData(g);
      })
      .catch((e: Error) => {
        if (current) setLoadError(e.message);
      });
    return () => {
      current = false;
    };
  }, [body, cad]);
  return (
    <SelectionDialog title="Geometrian muokkaus" onClose={onClose}>
      {data ? (
        <GeometryEditorReady
          body={body}
          geometry={data}
          linkedCount={linkedCount}
          lockedCopies={lockedCopies}
          busy={busy}
          error={error}
          onCommit={onCommit}
          onClose={onClose}
        />
      ) : (
        <div className="geometry-editor-loading">
          <p role={loadError ? 'alert' : 'status'}>
            {loadError || 'Valmistellaan muokattavaa geometriaa…'}
          </p>
          <button onClick={onClose}>Sulje</button>
        </div>
      )}
    </SelectionDialog>
  );
}
function GeometryEditorReady({
  body,
  geometry: g,
  linkedCount,
  lockedCopies,
  busy,
  error,
  onCommit,
  onClose,
}: Omit<Parameters<typeof GeometryEditor>[0], 'cad'> & { geometry: EditableGeometry }) {
  const meshCopy = !g.exact && body.feature.type !== 'mesh';
  const [copyAccepted, setCopyAccepted] = useState(false),
    [unique, setUnique] = useState(false);
  const [history, setHistory] = useState<Vec3[][]>([g.points]),
    [historyIndex, setHistoryIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]),
    [mode, setMode] = useState<GeometrySelection>('points');
  const [operation, setOperation] = useState<GeometryOperation>('move'),
    [values, setValues] = useState<string[]>(defaults('move'));
  const [axes, setAxes] = useState<[boolean, boolean, boolean]>([true, true, true]),
    [uniform, setUniform] = useState(true);
  const [local, setLocal] = useState(false),
    [allEdges, setAllEdges] = useState(false),
    [xray, setXray] = useState(false);
  const [customPivot, setCustomPivot] = useState<Vec3>(),
    [picking, setPicking] = useState<'pivot' | 'reference'>();
  const [drag, setDrag] = useState<Vec3[]>(),
    [stageError, setStageError] = useState('');
  const [view, setView] = useState<{ id: number; kind: 'fit' | 'top' | 'front' | 'right' | 'iso' }>(
    { id: 0, kind: 'fit' },
  );
  const [grid, setGrid] = useState(false);
  const base = history[historyIndex];
  const frame = local
    ? (body.textureFrame?.rotation ?? body.component?.rotation ?? identity)
    : identity;
  const pivot = customPivot ?? selectionCenter(base, selected);
  const numeric = useMemo(() => {
    try {
      const v = values.map((s, i) => {
        if (!axes[i]) return operation === 'scale' ? 1 : 0;
        if (operation === 'move') return parseLength(s.trim() || '0', true, true);
        const text = (operation === 'scale' && uniform ? values[0] : s)
          .replace(',', '.')
          .replace(/[°%]/g, '')
          .trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('Anna mitat numeroina.');
        return Number(text) / (operation === 'scale' ? 100 : 1);
      }) as Vec3;
      return {
        points: transformGeometryPoints(base, selected, geometryMatrix(operation, v, pivot, frame)),
        error: '',
      };
    } catch (e) {
      return { points: base, error: (e as Error).message };
    }
  }, [base, selected, values, axes, operation, uniform, pivot.join(','), frame.join(',')]);
  const points = drag ?? numeric.points;
  const changed = points.some((p, i) => p.some((n, k) => Math.abs(n - g.points[i][k]) > 1e-8));
  const pending = points.some((p, i) => p.some((n, k) => Math.abs(n - base[i][k]) > 1e-8));
  const errorText = stageError || numeric.error || error;
  const resetValues = () => {
    setValues(defaults(operation));
    setDrag(undefined);
  };
  const bake = (next = points) => {
    if (next.some((p, i) => p.some((n, k) => Math.abs(n - base[i][k]) > 1e-8))) {
      const stack = [...history.slice(0, historyIndex + 1), next].slice(-31);
      setHistory(stack);
      setHistoryIndex(stack.length - 1);
    }
    resetValues();
    setStageError('');
  };
  const select = (ids: number[], extend: boolean) => {
    if (pending && !numeric.error) bake();
    setSelected((old) =>
      extend
        ? ids.every((i) => old.includes(i))
          ? old.filter((i) => !ids.includes(i))
          : [...new Set([...old, ...ids])]
        : ids,
    );
  };
  const switchOperation = (next: GeometryOperation) => {
    if (pending && !numeric.error) bake();
    setOperation(next);
    setValues(defaults(next));
    setPicking(undefined);
  };
  const undo = () => {
    if (pending) {
      resetValues();
      return;
    }
    setHistoryIndex((i) => Math.max(0, i - 1));
    setStageError('');
  };
  const redo = () => {
    resetValues();
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
    setStageError('');
  };
  const pick = (point: Vec3) => {
    if (picking === 'pivot') {
      if (pending && !numeric.error) bake();
      setCustomPivot(point);
    } else {
      // Project the reference displacement onto the enabled axes in the chosen frame.
      const delta = new Vector3(...point)
        .sub(new Vector3(...pivot))
        .applyQuaternion(new Quaternion(...frame).invert());
      setOperation('move');
      setValues(delta.toArray().map((n, i) => (axes[i] ? String(n) : '0')));
    }
    setPicking(undefined);
  };
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
  const accept = () => {
    if (!busy && changed && !stageError && !numeric.error && (!lockedCopies || unique || meshCopy))
      void onCommit(points, meshCopy, unique);
  };
  if (meshCopy && !copyAccepted)
    return (
      <div className="geometry-editor-loading">
        <p>
          <strong>{body.name}</strong> sisältää kaarevia CAD-pintoja.
        </p>
        <p>
          Vapaa pistemuokkaus tehdään erilliseen verkkokopioon. Alkuperäinen tarkka osa säilyy
          piilotettuna. Verkkokopio tukee sijoittelua, materiaaleja ja STL-vientiä; tarkat
          CAD-pintatyökalut säilyvät alkuperäisessä osassa.
        </p>
        <button className="button dark" onClick={() => setCopyAccepted(true)}>
          Muokkaa verkkokopiota
        </button>
        <button className="button subtle" onClick={onClose}>
          Peruuta
        </button>
      </div>
    );
  return (
    <div
      className="geometry-editor"
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === 'Escape' && picking) {
          e.preventDefault();
          e.stopPropagation();
          setPicking(undefined);
          return;
        }
        if ((e.target as HTMLElement).closest('input,select,textarea')) return;
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) redo();
          else undo();
        }
        if (['m', 'r', 'l'].includes(key) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          switchOperation(
            ({ m: 'move', r: 'rotate', l: 'scale' } as const)[key as 'm' | 'r' | 'l'],
          );
        }
        if (['x', 'y', 'z'].includes(key) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setAxes([key === 'x', key === 'y', key === 'z']);
        }
      }}
    >
      <header className="geometry-editor-heading">
        <div>
          <strong>{body.name}</strong>
          <span>
            {meshCopy ? 'Erillinen verkkokopio' : g.exact ? 'Tarkka CAD-osa' : 'Kolmiomalli'}
          </span>
        </div>
        <button aria-label="Sulje geometrian muokkaus" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="geometry-editor-toolbar">
        <div className="mode-switch" aria-label="Geometrian valintatapa">
          {(
            [
              ['points', 'Pisteet'],
              ['edges', 'Reunat'],
              ['faces', 'Pinnat'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)} disabled={busy}>
              {label}
            </button>
          ))}
        </div>
        <div className="mode-switch" aria-label="Geometrian muutos">
          {(
            [
              ['move', 'Siirrä', <Move size={16} />],
              ['rotate', 'Kierrä', <RotateCw size={16} />],
              ['scale', 'Skaalaa', <Scaling size={16} />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              aria-pressed={operation === id}
              onClick={() => switchOperation(id)}
              disabled={busy}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <button
          aria-label="Peru geometriamuutos"
          title="Peru muutos · Ctrl+Z"
          disabled={busy || (!pending && !historyIndex)}
          onClick={undo}
        >
          <Undo2 size={17} />
        </button>
        <button
          aria-label="Palauta geometriamuutos"
          disabled={busy || historyIndex === history.length - 1}
          onClick={redo}
        >
          <Redo2 size={17} />
        </button>
      </div>
      <div className="geometry-editor-content">
        <div className="geometry-editor-viewport">
          <GeometryStage
            geometry={g}
            points={points}
            selected={selected}
            mode={mode}
            operation={operation}
            pivot={pivot}
            frame={frame}
            axes={axes}
            xray={xray}
            allEdges={allEdges}
            picking={picking}
            snap={grid ? 1 : 0}
            uniformScale={uniform}
            view={view}
            disabled={busy}
            onSelect={select}
            onPick={pick}
            onTransform={(next, complete) => (complete ? bake(next) : setDrag(next))}
            onError={setStageError}
          />
          <div className="geometry-view-actions">
            {(
              [
                ['iso', '3D'],
                ['top', 'Ylhäältä'],
                ['front', 'Edestä'],
                ['right', 'Sivulta'],
                ['fit', 'Sovita'],
              ] as const
            ).map(([kind, label]) => (
              <button key={kind} onClick={() => setView({ id: view.id + 1, kind })}>
                {label}
              </button>
            ))}
          </div>
          <p className="geometry-stage-help">
            {picking === 'pivot'
              ? 'Poimi kierron ja skaalauksen ankkuripiste.'
              : picking === 'reference'
                ? 'Poimi tavoitepiste. Siirtymä seuraa valittuja akseleita.'
                : matchMedia('(pointer: coarse)').matches
                  ? 'Napauta tai rajaa valinta · Kaksi sormea kiertää ja zoomaa'
                  : 'Napsauta tai rajaa valinta · Shift lisää · Oikea painike kiertää'}
          </p>
        </div>
        <aside
          className="geometry-editor-settings"
          inert={busy}
          aria-label="Geometriamuutoksen asetukset"
        >
          <strong role="status">Valittuna {selected.length} pistettä</strong>
          <div className="geometry-selection-actions">
            <button
              disabled={busy}
              onClick={() =>
                select(
                  base.map((_, i) => i),
                  false,
                )
              }
            >
              Kaikki
            </button>
            <button disabled={busy || !selected.length} onClick={() => select([], false)}>
              Tyhjennä
            </button>
          </div>
          {mode === 'edges' && (
            <p className="muted">Tuplaklikkaa reunaa valitaksesi yhtenäisen reunalenkin.</p>
          )}
          <label className="checkbox-label">
            <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
            Valitse myös takana olevat pisteet
          </label>
          <div className="geometry-axis-buttons" aria-label="Muokattavat akselit">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <button
                key={axis}
                data-axis={axis.toLowerCase()}
                aria-pressed={axes[i]}
                onClick={() =>
                  setAxes(
                    (old) => old.map((v, j) => (i === j ? !v : v)) as [boolean, boolean, boolean],
                  )
                }
              >
                {axis}
              </button>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={local}
              onChange={(e) => {
                if (pending && !numeric.error) bake();
                setLocal(e.target.checked);
              }}
            />
            Osan omat akselit
          </label>
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
                    if (pending && !numeric.error) bake();
                    setUniform(e.target.checked);
                  }}
                />
                Sama suhde valituille akseleille
              </label>
            )}
            {(operation === 'scale' && uniform ? ['Skaala'] : ['X', 'Y', 'Z']).map((axis, i) => (
              <label key={axis}>
                <span>{axis}</span>
                <input
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
                      if (!numeric.error) bake();
                    }
                  }}
                />
              </label>
            ))}
            <button
              className="button outlined full"
              disabled={!pending || !!numeric.error}
              onClick={() => bake()}
            >
              Toteuta muutos
            </button>
          </fieldset>
          <div className="geometry-pivot-actions">
            <button
              disabled={!selected.length || busy}
              aria-pressed={picking === 'pivot'}
              onClick={() => {
                if (pending && !numeric.error) bake();
                setPicking(picking === 'pivot' ? undefined : 'pivot');
              }}
            >
              <Crosshair size={15} />
              Poimi ankkuri
            </button>
            <button
              disabled={!selected.length || busy}
              aria-pressed={picking === 'reference'}
              onClick={() => {
                if (pending && !numeric.error) bake();
                setPicking(picking === 'reference' ? undefined : 'reference');
              }}
            >
              Poimi viite
            </button>
          </div>
          {customPivot && (
            <button
              className="button subtle full"
              onClick={() => {
                if (pending && !numeric.error) bake();
                setCustomPivot(undefined);
              }}
            >
              Ankkuri valinnan keskelle
            </button>
          )}
          <details>
            <summary>Valinta ja tarkkuus</summary>
            <p className="muted">Valitse uloimman tason pisteet:</p>
            <div className="geometry-plane-buttons">
              {['X', 'Y', 'Z'].flatMap((a, i) =>
                [false, true].map((max) => (
                  <button
                    key={`${a}${max}`}
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
              Näytä myös kolmioiden sisäreunat
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
              Siirron askel 1 mm
            </label>
            <small>
              {g.points.length} pistettä · {g.triangles.length / 3} kolmiota. Kirjoitettu mitta
              ohittaa askeleen.
            </small>
          </details>
          {!meshCopy && linkedCount > 1 && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={unique}
                onChange={(e) => setUnique(e.target.checked)}
              />
              Muokkaa vain tätä osaa · tee uniikki
            </label>
          )}
          {!meshCopy && linkedCount > 1 && !unique && (
            <p className="muted">Muutos jaetaan {linkedCount} linkitettyyn osaan.</p>
          )}
          {!!lockedCopies && !unique && !meshCopy && (
            <p role="alert">
              Linkitetyissä kopioissa on lukittuja osia. Tee tästä osasta uniikki tai peru ja
              vapauta lukitukset.
            </p>
          )}
        </aside>
      </div>
      <footer className="geometry-editor-footer">
        <p role={errorText ? 'alert' : 'status'}>
          {errorText ||
            (busy
              ? 'Tarkistetaan ja tallennetaan geometriaa…'
              : changed
                ? 'Esikatselu · alkuperäinen muuttuu vasta hyväksyttäessä.'
                : 'Valitse pisteitä, reuna tai pinta ja vedä akselikahvasta tai kirjoita mitta.')}
        </p>
        <button
          className="button dark"
          disabled={
            busy ||
            !changed ||
            !!stageError ||
            !!numeric.error ||
            (!!lockedCopies && !unique && !meshCopy)
          }
          onClick={accept}
        >
          <Check size={16} />
          {meshCopy ? 'Luo verkkokopio' : 'Hyväksy osaan'}
        </button>
        <button className="button subtle" onClick={onClose}>
          Peru · Esc
        </button>
      </footer>
    </div>
  );
}
