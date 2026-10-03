import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Download, Ruler, Trash2, X } from 'lucide-react';
import type { CadClient } from '../cad/client';
import type { BodyMesh, DrawingView, Projection } from '../cad/protocol';
import {
  axisIndex,
  isPointDimension,
  dimensionValue,
  uid,
  type Axis,
  type PointDimension,
  type Project,
  type Vec3,
} from '../model/project';
import {
  addBodyDimensions,
  pointDimensionGeometry,
  pointDimensionInView,
} from '../model/dimensions';
import { formatLength } from '../model/units';
import { downloadFile, safeFilename } from '../storage/projects';
import { createSheet, projectPoint, recommendedScale, viewLabels } from './svg';
import { drawingProject, pickDrawingPoint, type DrawingPick } from './selection';
import { exportDrawingPDF } from './export';
import { drawingDimension, shiftDrawingDimension, type DimensionDirection } from './placement';

export function DrawingWorkspace({
  project,
  cad,
  meshes,
  selectedIds,
  selectedGroupId,
  busy,
  onCommit,
}: {
  project: Project;
  cad: CadClient;
  meshes: BodyMesh[];
  selectedIds: string[];
  selectedGroupId?: string;
  busy: boolean;
  onCommit: (project: Project, message: string) => Promise<boolean>;
}) {
  const [target, setTarget] = useState(
    selectedGroupId ? `group:${selectedGroupId}` : selectedIds.length ? 'selection' : 'all',
  );
  const [view, setView] = useState<DrawingView>('front');
  const [manualScale, setManualScale] = useState<number>();
  const [hidden, setHidden] = useState(false);
  const [projection, setProjection] = useState<Projection>();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [picks, setPicks] = useState<DrawingPick[]>([]);
  const [hover, setHover] = useState<DrawingPick>();
  const [cursor, setCursor] = useState<[number, number]>();
  const [selectedDimension, setSelectedDimension] = useState<string>();
  const [direction, setDirection] = useState<DimensionDirection>('auto');
  const [dragPreview, setDragPreview] = useState<PointDimension>();
  const dragRef = useRef<{
    source: PointDimension;
    x: number;
    y: number;
    ratio: number;
    pointerId: number;
    moved: boolean;
  }>(undefined);
  const endDrag = () => {
    dragRef.current = undefined;
    setDragPreview(undefined);
  };
  const paper = useRef<HTMLDivElement>(null);
  const scoped = useMemo(
    () => drawingProject(project, target, selectedIds),
    [project, target, selectedIds],
  );
  const shownMeshes = useMemo(
    () => meshes.filter((m) => scoped.bodies.some((b) => b.id === m.id)),
    [meshes, scoped.bodies],
  );
  const scale = manualScale ?? recommendedScale(scoped, view);
  useEffect(() => {
    if (
      (target.startsWith('group:') && !project.groups.some((g) => `group:${g.id}` === target)) ||
      (target.startsWith('body:') && !project.bodies.some((b) => `body:${b.id}` === target))
    )
      setTarget('all');
  }, [project, target]);
  // Dimensions and sheet options must not rebuild the CAD projection.
  const projectionKey = JSON.stringify(scoped.bodies);
  useEffect(() => {
    let active = true;
    setProjection(undefined);
    setError('');
    setPicks([]);
    setHover(undefined);
    setCursor(undefined);
    if (scoped.bodies.length)
      void cad
        .project(scoped.bodies, view)
        .then((p) => {
          if (active) setProjection(p);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [projectionKey, cad, view]);
  const sheet = useMemo(
    () => (projection ? createSheet(scoped, projection, view, scale, hidden) : undefined),
    [projection, scoped, view, scale, hidden],
  );
  const horizontal: Axis = view === 'right' ? 'y' : 'x',
    vertical: Axis = view === 'top' ? 'y' : 'z';
  const draft = useMemo(
    () => (cursor ? drawingDimension(picks, cursor, view, direction) : undefined),
    [picks, cursor, view, direction],
  );
  const reset = () => {
    setPicks([]);
    setHover(undefined);
    setCursor(undefined);
    endDrag();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.key === 'Escape' && dragRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        endDrag();
        return;
      }
      if (e.key === 'Escape' && measuring) {
        e.preventDefault();
        e.stopImmediatePropagation();
        reset();
        setMeasuring(false);
      }
      if (e.key === 'Enter' && draft) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void accept();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [draft, measuring, project, busy]);
  const accept = async (candidate = draft) => {
    if (!candidate || busy || pointDimensionGeometry(project.bodies, candidate).value < 0.01)
      return;
    if (!pointDimensionInView(project.bodies, candidate, view)) {
      setError(
        'Pistevälimitta vaatii samassa näkymätasossa olevat pisteet. Valitse vaaka- tai pystymitta.',
      );
      return;
    }
    setError('');
    if (
      await onCommit(
        { ...project, dimensions: [...project.dimensions, { ...candidate, id: uid() }] },
        'Mittaviiva lisätty.',
      )
    )
      reset();
  };
  const pointer = (e: PointerEvent) => {
    if (!sheet) return;
    const svg = paper.current?.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect(),
      px = rect.width / 297;
    const point: [number, number] = [
      ((e.clientX - rect.left) / px - sheet.transform.x) * scale,
      ((e.clientY - rect.top) / px - sheet.transform.y) * scale,
    ];
    return { point, pick: pickDrawingPoint(shownMeshes, view, point, (12 / px) * scale) };
  };
  const addOverall = async (axes: Axis[]) => {
    if (!scoped.bodies.length) return;
    if (scoped.bodies.length === 1) {
      await onCommit(
        addBodyDimensions(
          project,
          scoped.bodies.map((b) => b.id),
          axes,
        ),
        'Kokonaismitta lisätty.',
      );
      return;
    }
    const vertices = shownMeshes.flatMap((m) => m.verticesCAD);
    const dimensions: PointDimension[] = [];
    for (const axis of axes) {
      const i = axisIndex[axis],
        sorted = [...vertices].sort((a, b) => a.point[i] - b.point[i]);
      const start = sorted[0],
        end = sorted.at(-1);
      if (!start || !end || Math.abs(end.point[i] - start.point[i]) < 0.01) continue;
      const offset: Vec3 = [0, 0, 0];
      const other = axisIndex[axis === horizontal ? vertical : horizontal];
      offset[other] =
        Math.min(...vertices.map((v) => v.point[other])) - start.point[other] - 12 * scale;
      const dimension: PointDimension = {
        id: uid(),
        kind: 'points',
        axis,
        start: start.anchor,
        end: end.anchor,
        fallback: [start.point, end.point],
        offset,
        normal: view === 'front' ? [0, -1, 0] : view === 'right' ? [1, 0, 0] : [0, 0, 1],
      };
      if (
        !project.dimensions.some(
          (d) =>
            'kind' in d &&
            d.axis === axis &&
            JSON.stringify(d.start) === JSON.stringify(start.anchor) &&
            JSON.stringify(d.end) === JSON.stringify(end.anchor),
        )
      )
        dimensions.push(dimension);
    }
    if (dimensions.length)
      await onCommit(
        { ...project, dimensions: [...project.dimensions, ...dimensions] },
        'Kohteen kokonaismitat lisätty.',
      );
  };
  const removeDimension = async (id: string) => {
    if (
      await onCommit(
        { ...project, dimensions: project.dimensions.filter((d) => d.id !== id) },
        'Mitta poistettu.',
      )
    )
      setSelectedDimension(undefined);
  };
  const sheetPoint = (point: Vec3) => {
    const p = projectPoint(point, view);
    return [p[0] / scale + sheet!.transform.x, p[1] / scale + sheet!.transform.y];
  };
  const activePreview = dragPreview ?? draft;
  const preview =
    activePreview && sheet ? pointDimensionGeometry(project.bodies, activePreview) : undefined;
  useEffect(() => {
    paper.current?.querySelectorAll<SVGGElement>('[data-dimension]').forEach((el) => {
      const id = el.getAttribute('data-dimension');
      el.classList.toggle('is-selected', id === selectedDimension);
      el.classList.toggle('is-dragging', id === dragPreview?.id);
    });
  }, [selectedDimension, sheet, dragPreview?.id]);
  return (
    <section className="drawing-studio" aria-label="Mittakuvan työtila">
      <div className="drawing-sheet-column">
        <div className="drawing-view-tabs" aria-label="Mittakuvan näkymä">
          {(Object.entries(viewLabels) as [DrawingView, string][]).map(([id, name]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => {
                setView(id);
                reset();
              }}
            >
              {name}
            </button>
          ))}
          <span>
            A4 · {manualScale ? '' : 'Sovitettu · '}1:{scale}
          </span>
        </div>
        <p className="drawing-step" role="status">
          {measuring
            ? picks.length === 0
              ? '1. Poimi ensimmäinen piste piirroksesta.'
              : picks.length === 1
                ? '2. Poimi toinen piste.'
                : '3. Vie mittaviiva sivulle ja napsauta. Enter hyväksyy, Esc peruu.'
            : 'Lisää mitat ja vie valmis mittakuva. Itse lisättyä mittaviivaa voi siirtää vetämällä.'}
        </p>
        <div className="drawing-area" data-testid="drawing-area">
          {error && <p role="alert">{error}</p>}
          {!scoped.bodies.length ? (
            <p>Valitse kohteeksi osa tai ryhmä.</p>
          ) : !sheet ? (
            <p>Muodostetaan mittakuvaa…</p>
          ) : (
            <>
              {!sheet.fits && (
                <p role="alert" className="drawing-warning">
                  Malli ja mitat eivät mahdu arkille.{' '}
                  <button onClick={() => setManualScale(undefined)}>Sovita arkille</button>
                </p>
              )}
              {sheet.orphanCount > 0 && (
                <p role="alert" className="drawing-warning">
                  {sheet.orphanCount} mittaviitettä puuttuu. Poista rikkoutunut mitta luettelosta.
                </p>
              )}
              <div
                ref={paper}
                className={`drawing-paper ${measuring ? 'is-measuring' : ''}`}
                onPointerMove={(e) => {
                  const drag = dragRef.current;
                  if (drag && drag.pointerId === e.pointerId) {
                    const dx = e.clientX - drag.x,
                      dy = e.clientY - drag.y;
                    if (Math.hypot(dx, dy) > 3) drag.moved = true;
                    if (drag.moved)
                      setDragPreview(
                        shiftDrawingDimension(
                          drag.source,
                          [dx * drag.ratio, dy * drag.ratio],
                          view,
                        ),
                      );
                    return;
                  }
                  if (!measuring) return;
                  const p = pointer(e);
                  if (p) {
                    setCursor(p.point);
                    setHover(p.pick);
                  }
                }}
                onPointerLeave={() => setHover(undefined)}
                onPointerDown={(e) => {
                  if (e.button !== 0 || busy) return;
                  if (!measuring) {
                    const id =
                      (e.target as Element)
                        .closest('[data-dimension]')
                        ?.getAttribute('data-dimension') ?? undefined;
                    setSelectedDimension(id);
                    const dimension = project.dimensions.find((d) => d.id === id);
                    const svg = paper.current?.querySelector('svg');
                    if (
                      dimension &&
                      isPointDimension(dimension) &&
                      svg &&
                      pointDimensionInView(project.bodies, dimension, view)
                    ) {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = {
                        source: dimension,
                        x: e.clientX,
                        y: e.clientY,
                        ratio: (scale * 297) / svg.getBoundingClientRect().width,
                        pointerId: e.pointerId,
                        moved: false,
                      };
                    }
                    return;
                  }
                  e.preventDefault();
                  if (picks.length === 2) {
                    const p = pointer(e);
                    if (p) void accept(drawingDimension(picks, p.point, view, direction));
                    return;
                  }
                  const p = pointer(e);
                  if (
                    p?.pick &&
                    (!picks.length ||
                      Math.hypot(...p.pick.point.map((n, i) => n - picks[0].point[i])) > 0.01)
                  ) {
                    setPicks([...picks, p.pick]);
                    setCursor(p.point);
                  }
                }}
                onPointerUp={(e) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== e.pointerId) return;
                  const next = shiftDrawingDimension(
                    drag.source,
                    [(e.clientX - drag.x) * drag.ratio, (e.clientY - drag.y) * drag.ratio],
                    view,
                  );
                  endDrag();
                  if (drag.moved && !busy)
                    void onCommit(
                      {
                        ...project,
                        dimensions: project.dimensions.map((d) => (d.id === next.id ? next : d)),
                      },
                      'Mittaviivan sijainti päivitetty.',
                    );
                }}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              >
                <div dangerouslySetInnerHTML={{ __html: sheet.svg }} />
                {(measuring || dragPreview) && (
                  <svg className="drawing-pick-overlay" viewBox="0 0 297 210" aria-hidden="true">
                    {preview && (
                      <g fill="none" stroke="#49735b" strokeWidth="0.4">
                        <polyline
                          points={[preview.start, preview.a, preview.b, preview.end]
                            .map((p) => sheetPoint(p).join(','))
                            .join(' ')}
                        />
                        <text
                          x={(sheetPoint(preview.a)[0] + sheetPoint(preview.b)[0]) / 2}
                          y={(sheetPoint(preview.a)[1] + sheetPoint(preview.b)[1]) / 2 - 2}
                          fill="#31523e"
                          stroke="none"
                          fontSize="3.2"
                          textAnchor="middle"
                        >
                          {formatLength(preview.value)} mm
                        </text>
                      </g>
                    )}
                    {[...picks, ...(hover && picks.length < 2 ? [hover] : [])].map((pick, i) => {
                      const p = sheetPoint(pick.point);
                      return (
                        <circle
                          key={i}
                          cx={p[0]}
                          cy={p[1]}
                          r="1.2"
                          stroke="#31523e"
                          strokeWidth="0.4"
                          fill="white"
                        />
                      );
                    })}
                  </svg>
                )}
              </div>
              {measuring && hover && picks.length < 2 && (
                <span className="drawing-snap" data-testid="drawing-snap">
                  {hover.label}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <aside className="drawing-controls" aria-label="Mittakuvan toiminnot">
        <label>
          Kohde
          <select
            aria-label="Mittakuvan kohde"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              reset();
            }}
          >
            <option value="all">Kaikki näkyvät osat</option>
            {!!selectedIds.length && (
              <option value="selection">Mallin valinta ({selectedIds.length})</option>
            )}
            {!!project.groups.length && (
              <optgroup label="Ryhmät">
                {project.groups.map((g) => (
                  <option key={g.id} value={`group:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Osat">
              {project.bodies
                .filter((b) => b.purpose !== 'construction')
                .map((b) => (
                  <option key={b.id} value={`body:${b.id}`}>
                    {b.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <button
          className={`button ${measuring ? 'dark' : 'outlined'} full`}
          disabled={busy || !sheet}
          aria-pressed={measuring}
          onClick={() => {
            setMeasuring(!measuring);
            reset();
          }}
        >
          <Ruler size={16} />
          {measuring ? 'Lopeta mitoitus' : 'Lisää mitta'}
        </button>
        {measuring && (
          <label>
            Mitan suunta
            <select
              aria-label="Mitan suunta"
              value={direction}
              onChange={(e) => setDirection(e.target.value as DimensionDirection)}
            >
              <option value="auto">Automaattinen</option>
              <option value="horizontal">Vaaka</option>
              <option value="vertical">Pysty</option>
              <option value="distance">Pisteväli</option>
            </select>
          </label>
        )}
        <button
          className="button outlined full"
          disabled={busy || !sheet}
          onClick={() => void addOverall([horizontal, vertical])}
        >
          Lisää kokonaismitat
        </button>
        <details className="drawing-options-disclosure">
          <summary>Yksittäinen kokonaismitta</summary>
          <div className="dimension-buttons">
            <button
              className="button outlined"
              disabled={busy || !sheet}
              onClick={() => void addOverall([horizontal])}
            >
              {view === 'right' ? 'Syvyys' : 'Leveys'}
            </button>
            <button
              className="button outlined"
              disabled={busy || !sheet}
              onClick={() => void addOverall([vertical])}
            >
              {view === 'top' ? 'Syvyys' : 'Korkeus'}
            </button>
          </div>
        </details>
        <div className="dimension-list">
          {scoped.dimensions.map((d) => (
            <div
              key={d.id}
              className={`${dimensionValue(project, d) === null ? 'broken' : ''} ${selectedDimension === d.id ? 'selected' : ''}`}
            >
              <button onClick={() => setSelectedDimension(d.id)}>
                <Ruler size={14} />
                <span>
                  {dimensionValue(project, d) === null
                    ? 'Viite puuttuu'
                    : `${formatLength(dimensionValue(project, d)!)} mm`}
                  <small>
                    {d.axis === 'distance' ? 'Pisteväli' : `${d.axis.toUpperCase()}-suunta`}
                  </small>
                </span>
              </button>
              <button
                className="icon-button"
                aria-label="Poista mitta"
                disabled={busy}
                onClick={() => void removeDimension(d.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!scoped.dimensions.length && (
            <p className="muted">
              Ei vielä mittoja. Aloita kokonaismitoista tai poimi kaksi pistettä.
            </p>
          )}
        </div>
        <details className="drawing-options-disclosure">
          <summary>Arkin asetukset</summary>
          <label>
            Mittakaava
            <select
              aria-label="Mittakaava"
              value={manualScale ?? 'auto'}
              onChange={(e) =>
                setManualScale(e.target.value === 'auto' ? undefined : Number(e.target.value))
              }
            >
              <option value="auto">Automaattinen sovitus</option>
              {[1, 2, 5, 10, 20, 50, 100, 500, 1000].map((s) => (
                <option key={s} value={s}>
                  1:{s}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Näytä piiloviivat
          </label>
          <p className="muted">A4 vaaka · millimetrit</p>
        </details>
        <div className="drawing-export">
          <button
            className="button dark full"
            disabled={busy || exporting || !sheet?.fits || !!sheet?.orphanCount}
            onClick={() => {
              if (!sheet) return;
              setExporting(true);
              setError('');
              void exportDrawingPDF(sheet, `${project.name}-${view}`)
                .catch((e) => setError(e.message))
                .finally(() => setExporting(false));
            }}
          >
            <Download size={16} />
            {exporting ? 'Luodaan PDF…' : 'Vie PDF'}
          </button>
          <button
            className="button subtle full"
            disabled={busy || !sheet?.fits || !!sheet?.orphanCount}
            onClick={() =>
              sheet &&
              downloadFile(sheet.svg, `${safeFilename(project.name)}-${view}.svg`, 'image/svg+xml')
            }
          >
            Vie SVG-mittakuva
          </button>
          <p className="muted">Tulosta PDF 100 % koossa.</p>
        </div>
      </aside>
    </section>
  );
}
