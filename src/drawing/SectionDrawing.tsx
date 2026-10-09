import { Eye, EyeOff } from 'lucide-react';
import { AnnotationProperties } from '../ui/AnnotationProperties';
import { annotationText } from '../model/annotationStyle';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Project } from '../model/project';
import { uid } from '../model/project';
import type { CadClient } from '../cad/client';
import type { SectionResult } from '../cad/protocol';
import type { Section, SectionAnchor } from '../model/sections';
import { bodyVisible } from '../model/transforms';
import { drawingProject } from './selection';
import {
  sectionDimensionGeometry,
  sectionPoint,
  sectionSheet,
  validSectionDimensions,
} from './sectionSvg';
import { exportDrawingPDF } from './export';
import { downloadFile, safeFilename } from '../storage/projects';
import { formatLength } from '../model/units';

export function SectionDrawing({
  project,
  section,
  cad,
  busy,
  onCommit,
  onSection,
  onBack,
  onSheets,
  selectedIds,
}: {
  project: Project;
  selectedIds: string[];
  section: Section;
  cad: CadClient;
  busy: boolean;
  onCommit: (project: Project, message: string) => Promise<boolean>;
  onSection: (id: string) => void;
  onBack: () => void;
  onSheets?: () => void;
}) {
  const [selectedDimension, setSelectedDimension] = useState<string>();
  const [annotationFocus, setAnnotationFocus] = useState(0);
  const selectedAnnotation = section.dimensions.find((d) => d.id === selectedDimension);
  const patchAnnotation = (id: string, patch: { label?: string; hidden?: boolean }) => {
    if (busy) return;
    void onCommit(
      {
        ...project,
        sections: project.sections?.map((s) =>
          s.id === section.id
            ? { ...s, dimensions: s.dimensions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }
            : s,
        ),
      },
      patch.hidden === undefined
        ? 'Merkinnän teksti muutettu.'
        : patch.hidden
          ? 'Leikkausmitta piilotettu.'
          : 'Leikkausmitta palautettu näkyviin.',
    );
  };
  const removeDimension = (id: string) => {
    if (!busy)
      void onCommit(
        {
          ...project,
          sections: project.sections?.map((s) =>
            s.id === section.id ? { ...s, dimensions: s.dimensions.filter((d) => d.id !== id) } : s,
          ),
        },
        'Leikkausmitta poistettu.',
      );
  };
  const [scope, setScope] = useState(selectedIds.length ? 'selection' : 'all');
  const [result, setResult] = useState<SectionResult>();
  const [error, setError] = useState(''),
    [exporting, setExporting] = useState(false);
  const [manualScale, setManualScale] = useState<number>();
  const [hidden, setHidden] = useState(false),
    [measuring, setMeasuring] = useState(false);
  const [picks, setPicks] = useState<SectionAnchor[]>([]),
    [hover, setHover] = useState<SectionAnchor>();
  const [cursor, setCursor] = useState<[number, number]>();
  const [axis, setAxis] = useState<'horizontal' | 'vertical' | 'distance'>('horizontal');
  const paper = useRef<HTMLDivElement>(null);
  const bodies = useMemo(
    () =>
      drawingProject(project, scope, selectedIds).bodies.filter((b) =>
        bodyVisible(b, project.groups),
      ),
    [project.bodies, project.groups, scope, selectedIds],
  );
  const displayedSection = useMemo(() => {
    const ids = new Set(bodies.map((b) => b.id));
    return scope === 'all'
      ? section
      : {
          ...section,
          dimensions: section.dimensions.filter(
            (d) => ids.has(d.start.bodyId) && ids.has(d.end.bodyId),
          ),
        };
  }, [section, bodies, scope]);
  const key = JSON.stringify([
    bodies.map((b) => [b.id, b.feature, b.origin, b.purpose]),
    section.id,
    section.frame,
    section.flipped,
  ]);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError('');
    setPicks([]);
    setHover(undefined);
    setCursor(undefined);
    void cad
      .section(bodies, section, true)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [key, cad]);
  const scale =
    manualScale ??
    [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(
      (s) => result && sectionSheet(project, displayedSection, result, s, hidden).fits,
    ) ??
    1000;
  const sheet = useMemo(
    () => (result ? sectionSheet(project, displayedSection, result, scale, hidden) : undefined),
    [project, displayedSection, result, scale, hidden],
  );
  const validity = useMemo(
    () => (result ? validSectionDimensions(project, section, result) : new Map<string, boolean>()),
    [project, section, result],
  );
  const draft = useMemo(() => {
    if (picks.length !== 2 || !cursor) return;
    const a = sectionPoint(section, picks[0]),
      b = sectionPoint(section, picks[1]);
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const offset =
      axis === 'horizontal'
        ? cursor[1] - (a[1] + b[1]) / 2
        : axis === 'vertical'
          ? cursor[0] - (a[0] + b[0]) / 2
          : ((cursor[0] - a[0]) * -dy + (cursor[1] - a[1]) * dx) / (length || 1);
    return { id: uid(), start: picks[0], end: picks[1], axis, offset };
  }, [picks, cursor, axis, section]);
  const preview = useMemo(
    () =>
      result && draft
        ? sectionSheet(
            project,
            { ...displayedSection, dimensions: [...displayedSection.dimensions, draft] },
            result,
            scale,
            hidden,
            sheet?.transform,
          )
        : sheet,
    [project, displayedSection, result, draft, scale, hidden, sheet],
  );
  const shown = preview;
  useEffect(() => {
    paper.current
      ?.querySelectorAll<SVGGElement>('[data-section-dimension]')
      .forEach((el) =>
        el.classList.toggle('is-selected', el.dataset.sectionDimension === selectedDimension),
      );
  }, [shown, selectedDimension]);
  const pointer = (e: PointerEvent) => {
    if (!sheet || !result) return;
    const svg = paper.current?.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect(),
      ratio = rect.width / 297;
    const point: [number, number] = [
      ((e.clientX - rect.left) / ratio - sheet.transform.x) * scale,
      ((e.clientY - rect.top) / ratio - sheet.transform.y) * scale,
    ];
    const candidates = result.anchors
      .map((anchor) => ({
        anchor,
        distance: Math.hypot(...sectionPoint(section, anchor).map((n, i) => n - point[i])),
      }))
      .sort((a, b) => a.distance - b.distance);
    return {
      point,
      pick: candidates[0]?.distance < (12 / ratio) * scale ? candidates[0].anchor : undefined,
    };
  };
  const saveDimension = async () => {
    if (!draft || busy || sectionDimensionGeometry(section, draft).value < 0.01) return;
    if (
      await onCommit(
        {
          ...project,
          sections: project.sections?.map((s) =>
            s.id === section.id ? { ...s, dimensions: [...s.dimensions, draft] } : s,
          ),
        },
        'Leikkausmitta lisätty.',
      )
    ) {
      setPicks([]);
      setCursor(undefined);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.key === 'Escape') {
        setPicks([]);
        setCursor(undefined);
        setMeasuring(false);
      }
      if (e.key === 'Enter' && draft) {
        e.preventDefault();
        void saveDimension();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [draft, busy, project]);
  const doExport = async (pdf: boolean) => {
    if (!sheet || !sheet.fits || sheet.orphanCount) return;
    setExporting(true);
    setError('');
    try {
      const name = `${project.name}-leikkaus-${section.name}`;
      if (pdf) await exportDrawingPDF(sheet, name);
      else downloadFile(sheet.svg, `${safeFilename(name)}.svg`, 'image/svg+xml');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="drawing-studio" aria-label="Leikkauskuvan työtila">
      <div className="drawing-sheet-column">
        <div className="drawing-view-tabs">
          <button onClick={onBack}>Tavalliset mittakuvat</button>
          <button onClick={onSheets}>Luo mitta-arkki</button>
          {project.sections?.map((s) => (
            <button key={s.id} aria-pressed={s.id === section.id} onClick={() => onSection(s.id)}>
              Leikkaus {s.name}
            </button>
          ))}
        </div>
        <p className="drawing-step" role="status">
          {measuring
            ? picks.length < 2
              ? `Valitse leikkausreunan ${picks.length === 0 ? 'ensimmäinen' : 'toinen'} piste.`
              : 'Siirrä mittaviiva sivuun ja hyväksy klikkaamalla.'
            : 'Leikkauspinnat on viivoitettu. Mallin geometria säilyy ennallaan.'}
        </p>
        <div className="drawing-area" data-testid="section-drawing-area">
          {error && (
            <p role="alert" className="drawing-warning">
              {error}
            </p>
          )}
          {!result && !error && <p>Lasketaan tarkkaa leikkauskuvaa…</p>}
          {sheet && !sheet.fits && (
            <p role="alert" className="drawing-warning">
              Kuva ei mahdu arkille. Valitse pienempi mittakaava.
            </p>
          )}
          {!!sheet?.orphanCount && (
            <p role="alert" className="drawing-warning">
              {sheet.orphanCount} mittaviitettä muuttui. Poista ja mitoita ne uudelleen ennen
              vientiä.
            </p>
          )}
          {shown && (
            <div
              ref={paper}
              className={`drawing-paper ${measuring ? 'is-measuring' : ''}`}
              onPointerMove={(e) => {
                if (!measuring) return;
                const p = pointer(e);
                if (p) {
                  setHover(p.pick);
                  setCursor(p.point);
                }
              }}
              onDoubleClick={(e) => {
                if (measuring || busy) return;
                const id = (e.target as Element)
                  .closest('[data-section-dimension]')
                  ?.getAttribute('data-section-dimension');
                if (id) {
                  setSelectedDimension(id);
                  setAnnotationFocus((n) => n + 1);
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0 || busy) return;
                if (!measuring) {
                  setAnnotationFocus(0);
                  setSelectedDimension(
                    (e.target as Element)
                      .closest('[data-section-dimension]')
                      ?.getAttribute('data-section-dimension') ?? undefined,
                  );
                  return;
                }
                const p = pointer(e);
                if (picks.length === 2) {
                  void saveDimension();
                  return;
                }
                if (
                  p?.pick &&
                  (!picks[0] ||
                    Math.hypot(...p.pick.point.map((n, i) => n - picks[0].point[i])) > 0.01)
                )
                  setPicks([...picks, p.pick]);
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: shown.svg }} />
              {measuring && sheet && (
                <svg className="drawing-pick-overlay" viewBox="0 0 297 210" aria-hidden="true">
                  {[...picks, ...(hover ? [hover] : [])].map((p, i) => {
                    const q = sectionPoint(section, p);
                    return (
                      <circle
                        key={i}
                        cx={sheet.transform.x + q[0] / scale}
                        cy={sheet.transform.y + q[1] / scale}
                        r={1.5}
                        fill="#236a45"
                        stroke="white"
                        strokeWidth={0.5}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          )}
        </div>
      </div>
      <aside className="drawing-controls" aria-label="Leikkauskuvan toiminnot">
        <h2>Leikkaus {section.name}</h2>
        <label>
          Sisältö
          <select
            aria-label="Leikkauskuvan sisältö"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">Näkyvä malli</option>
            <option value="selection" disabled={!selectedIds.length}>
              Valitut osat ({selectedIds.length})
            </option>
            {project.groups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mittakaava
          <select
            aria-label="Leikkauskuvan mittakaava"
            value={manualScale ?? 'auto'}
            onChange={(e) =>
              setManualScale(e.target.value === 'auto' ? undefined : Number(e.target.value))
            }
          >
            <option value="auto">Sovita · 1:{scale}</option>
            {[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((s) => (
              <option value={s} key={s}>
                1:{s}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button outlined full"
          aria-pressed={measuring}
          disabled={!result || busy}
          onClick={() => {
            setMeasuring(!measuring);
            setPicks([]);
            setCursor(undefined);
          }}
        >
          Mitoita kahdesta pisteestä
        </button>
        {measuring && (
          <label>
            Mitan suunta
            <select
              aria-label="Leikkausmitan suunta"
              value={axis}
              onChange={(e) => setAxis(e.target.value as typeof axis)}
            >
              <option value="horizontal">Vaakasuora</option>
              <option value="vertical">Pystysuora</option>
              <option value="distance">Pisteiden väli</option>
            </select>
          </label>
        )}
        {project.settings.measurementsHidden && (
          <button
            className="annotation-visibility-notice"
            disabled={busy}
            onClick={() =>
              void onCommit(
                { ...project, settings: { ...project.settings, measurementsHidden: false } },
                'Mittamerkinnät palautettu näkyviin.',
              )
            }
          >
            Kaikki merkinnät on piilotettu · Näytä merkinnät
          </button>
        )}
        <div className="dimension-list">
          {displayedSection.dimensions.map((d) => (
            <div
              key={d.id}
              data-testid={`section-dimension-row-${d.id}`}
              className={`${validity.get(d.id) ? '' : 'broken'} ${selectedDimension === d.id ? 'selected' : ''} ${d.hidden ? 'is-hidden' : ''}`}
            >
              <button
                onClick={() => {
                  setAnnotationFocus(0);
                  setSelectedDimension(d.id);
                }}
              >
                <span>
                  {validity.get(d.id)
                    ? annotationText(
                        d,
                        sectionDimensionGeometry(section, d).value,
                        `${formatLength(sectionDimensionGeometry(section, d).value)} mm`,
                      )
                    : 'Viite muuttunut'}
                </span>
              </button>
              <button
                className="icon-button"
                aria-label={d.hidden ? 'Näytä dimensio' : 'Piilota dimensio'}
                disabled={busy}
                onClick={() => patchAnnotation(d.id, { hidden: !d.hidden })}
              >
                {d.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                aria-label="Poista leikkausmitta"
                disabled={busy}
                onClick={() => removeDimension(d.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {selectedAnnotation && (
          <AnnotationProperties
            annotation={selectedAnnotation}
            value={
              validity.get(selectedAnnotation.id)
                ? sectionDimensionGeometry(section, selectedAnnotation).value
                : null
            }
            busy={busy}
            focusKey={annotationFocus}
            onChange={(patch) => patchAnnotation(selectedAnnotation.id, patch)}
            onDelete={() => removeDimension(selectedAnnotation.id)}
          />
        )}
        <label className="checkbox-label">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />{' '}
          Näytä takana olevat reunat
        </label>
        <div className="drawing-export">
          <button
            className="button dark full"
            disabled={!sheet?.fits || !!sheet?.orphanCount || exporting}
            onClick={() => void doExport(true)}
          >
            Lataa PDF
          </button>
          <button
            className="button subtle full"
            disabled={!sheet?.fits || !!sheet?.orphanCount || exporting}
            onClick={() => void doExport(false)}
          >
            Lataa SVG
          </button>
          <p className="muted">A4 vaaka · tulosta 100 % koossa.</p>
        </div>
      </aside>
    </section>
  );
}
