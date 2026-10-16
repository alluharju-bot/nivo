import { HighlightStyleFields } from '../ui/HighlightStyleFields';
import { MarkupColor } from '../ui/MarkupColor';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Highlighter, MessageSquareText, MousePointer2, Eye, EyeOff, Trash2 } from 'lucide-react';
import { uid, type Project } from '../model/project';
import {
  drawingPageKey,
  type DrawingAnnotation,
  type DrawingPage,
} from '../model/drawingAnnotations';
import { annotateSheet, fitAnnotation, annotationLines } from './pageAnnotations';
import type { Sheet } from './svg';

/** Shared page editor: all three drawing workspaces use identical placement, undo and export. */
export function useDrawingAnnotations({
  project,
  page,
  busy,
  onCommit,
  onActivate,
  measuring = false,
  dimensionTool,
}: {
  project: Project;
  page: DrawingPage;
  busy: boolean;
  measuring?: boolean;
  dimensionTool?: ReactNode;
  onCommit: (project: Project, message: string) => Promise<boolean>;
  onActivate?: () => void;
}) {
  const key = drawingPageKey(page);
  const [mode, setMode] = useState<'note' | 'highlight'>();
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<DrawingAnnotation>();
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{
    source: DrawingAnnotation;
    start: [number, number];
    resize: boolean;
    creating: boolean;
    moved: boolean;
    preview: DrawingAnnotation;
  }>(undefined);
  const marks = useMemo(
    () => project.drawingAnnotations?.filter((m) => drawingPageKey(m.page) === key) ?? [],
    [project.drawingAnnotations, key],
  );
  const source = marks.find((m) => m.id === selected);
  const editing = draft?.id === selected ? draft : source;
  const displayed = marks.map((m) => (draft?.id === m.id ? draft : m));
  if (draft && !marks.some((m) => m.id === draft.id)) displayed.push(draft);
  useEffect(() => {
    setSelected(undefined);
    setDraft(undefined);
    setMode(undefined);
    drag.current = undefined;
  }, [key]);
  useEffect(() => {
    if (measuring) {
      setMode(undefined);
      setSelected(undefined);
      setDraft(undefined);
    }
  }, [measuring]);
  useEffect(() => {
    if (focus && editing?.kind === 'note') {
      textRef.current?.focus();
      textRef.current?.select();
    }
  }, [focus]);
  const save = async (m: DrawingAnnotation, message = 'Arkin merkintää muokattu.') => {
    if (busy) return false;
    const all = project.drawingAnnotations ?? [];
    const exists = all.some((a) => a.id === m.id);
    if (!exists && all.length >= 2000) {
      setError('Projektiin mahtuu enintään 2 000 arkkimerkintää.');
      return false;
    }
    try {
      const next = fitAnnotation(m);
      const okay = await onCommit(
        {
          ...project,
          drawingAnnotations: exists ? all.map((a) => (a.id === m.id ? next : a)) : [...all, next],
        },
        message,
      );
      if (okay) {
        setDraft(undefined);
        setError('');
      }
      return okay;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const remove = async (id: string) => {
    if (busy) return;
    if (
      await onCommit(
        { ...project, drawingAnnotations: project.drawingAnnotations?.filter((m) => m.id !== id) },
        'Arkin merkintä poistettu.',
      )
    ) {
      setSelected(undefined);
      setDraft(undefined);
    }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')) return;
      if (e.key === 'Escape' && (mode || selected || drag.current)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        drag.current = undefined;
        setDraft(undefined);
        setMode(undefined);
        setSelected(undefined);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !measuring) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void remove(selected);
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [mode, selected, project, busy, measuring]);
  const point = (e: PointerEvent<HTMLDivElement>): [number, number] | undefined => {
    const svg = e.currentTarget.querySelector('svg');
    const rect = svg?.getBoundingClientRect();
    if (!rect?.width) return;
    return [
      ((e.clientX - rect.left) * 297) / rect.width,
      ((e.clientY - rect.top) * 210) / rect.height,
    ];
  };
  const events = {
    onPointerDownCapture: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || busy || measuring) return;
      const p = point(e);
      if (!p) return;
      const target = (e.target as Element).closest('[data-paper-annotation]');
      const hit = marks.find((m) => m.id === target?.getAttribute('data-paper-annotation'));
      if (!mode && !hit) {
        setSelected(undefined);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onActivate?.();
      if (hit) {
        setSelected(hit.id);
        setDraft(undefined);
        drag.current = {
          source: hit,
          start: p,
          resize: !!(e.target as Element).closest('[data-annotation-resize]'),
          creating: false,
          moved: false,
          preview: hit,
        };
      } else {
        const m = fitAnnotation({
          id: uid(),
          page,
          kind: mode!,
          ...(mode === 'highlight'
            ? { lineStyle: 'solid' as const, lineWidth: 2, fillOpacity: 0 }
            : {}),
          x: p[0],
          y: p[1],
          width: mode === 'note' ? 60 : 4,
          height: 14,
          text: mode === 'note' ? 'Huomautus' : '',
          color: '#b18b35',
          fontSize: 3.2,
          bold: false,
        });
        setSelected(m.id);
        setDraft(m);
        drag.current = {
          source: m,
          start: [m.x, m.y],
          resize: mode === 'highlight',
          creating: true,
          moved: false,
          preview: m,
        };
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMoveCapture: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current,
        p = point(e);
      if (!d || !p) return;
      e.stopPropagation();
      const dx = p[0] - d.start[0],
        dy = p[1] - d.start[1];
      if (Math.hypot(dx, dy) > 0.7) d.moved = true;
      const candidate = d.resize
        ? d.creating
          ? {
              ...d.source,
              x: Math.min(p[0], d.start[0]),
              y: Math.min(p[1], d.start[1]),
              width: Math.abs(dx),
              height: Math.abs(dy),
            }
          : { ...d.source, width: d.source.width + dx, height: d.source.height + dy }
        : { ...d.source, x: d.source.x + dx, y: d.source.y + dy };
      d.preview = fitAnnotation(candidate);
      setDraft(d.preview);
    },
    onPointerUpCapture: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      drag.current = undefined;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (d.creating || d.moved) {
        if (d.creating && d.source.kind === 'highlight' && !d.moved) {
          setDraft(undefined);
          setSelected(undefined);
          return;
        }
        void save(
          d.preview,
          d.creating ? 'Arkin merkintä lisätty.' : 'Arkin merkintää siirretty.',
        ).then((ok) => {
          if (ok && d.creating && d.source.kind === 'note') setFocus((n) => n + 1);
        });
        if (d.creating) setMode(undefined);
      } else setDraft(undefined);
    },
    onPointerCancelCapture: () => {
      drag.current = undefined;
      setDraft(undefined);
    },
    onLostPointerCapture: () => {
      if (drag.current) {
        drag.current = undefined;
        setDraft(undefined);
      }
    },
    onDoubleClickCapture: (e: MouseEvent<HTMLDivElement>) => {
      const id = (e.target as Element)
        .closest('[data-paper-annotation]')
        ?.getAttribute('data-paper-annotation');
      if (!id || measuring) return;
      e.stopPropagation();
      setSelected(id);
      setFocus((n) => n + 1);
    },
  };
  const toolbar = (
    <div className="drawing-annotation-tools" aria-label="Arkin merkinnät">
      <button
        className="button subtle"
        aria-pressed={!mode && !measuring}
        onClick={() => {
          setMode(undefined);
          onActivate?.();
        }}
      >
        <MousePointer2 size={15} />
        Valitse
      </button>
      {dimensionTool}
      <button
        className="button subtle"
        aria-pressed={mode === 'note'}
        disabled={busy}
        onClick={() => {
          setMode(mode === 'note' ? undefined : 'note');
          setSelected(undefined);
          onActivate?.();
        }}
      >
        <MessageSquareText size={15} />
        Tekstilaatikko
      </button>
      <button
        className="button subtle"
        aria-pressed={mode === 'highlight'}
        disabled={busy}
        onClick={() => {
          setMode(mode === 'highlight' ? undefined : 'highlight');
          setSelected(undefined);
          onActivate?.();
        }}
      >
        <Highlighter size={15} />
        Korosta alue
      </button>
      {mode && (
        <span role="status">
          {mode === 'note'
            ? 'Napsauta tekstilaatikon paikka arkille.'
            : 'Vedä korostus haluamasi alueen ympärille.'}
        </span>
      )}
    </div>
  );
  const exportable = displayed.every(
    (m) =>
      m.hidden ||
      m.kind === 'highlight' ||
      annotationLines(m).length * m.fontSize * 1.4 + 6 <= m.height + 0.001,
  );
  const controls = (
    <div className="drawing-note-controls">
      {error && <p role="alert">{error}</p>}
      {!exportable && (
        <p role="alert" className="drawing-warning">
          Huomautus ei mahdu laatikkoon. Levennä sitä tai pienennä tekstiä ennen vientiä.
        </p>
      )}
      {editing && (
        <fieldset disabled={busy} className="paper-note-properties">
          <legend>{editing.kind === 'note' ? 'Tekstilaatikko' : 'Aluekorostus'}</legend>
          {editing.kind === 'note' && (
            <>
              <label>
                Huomautuksen teksti
                <textarea
                  ref={textRef}
                  aria-label="Arkin huomautus"
                  rows={4}
                  maxLength={1200}
                  value={editing.text}
                  onChange={(e) => setDraft(fitAnnotation({ ...editing, text: e.target.value }))}
                  onBlur={() => {
                    if (draft && JSON.stringify(draft) !== JSON.stringify(source)) void save(draft);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') e.currentTarget.blur();
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
                  }}
                />
              </label>
              <div className="paper-note-style">
                <label>
                  Tekstikoko
                  <select
                    aria-label="Arkin tekstikoko"
                    value={editing.fontSize}
                    onChange={(e) => void save({ ...editing, fontSize: Number(e.target.value) })}
                  >
                    {[2.5, 3.2, 4, 5, 7].map((n) => (
                      <option key={n} value={n}>
                        {n} mm
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editing.bold}
                    onChange={(e) => void save({ ...editing, bold: e.target.checked })}
                  />
                  Lihavoitu
                </label>
              </div>
              {annotationLines(editing).length * editing.fontSize * 1.4 + 6 > editing.height && (
                <p role="alert">Teksti ei mahdu. Levennä laatikkoa tai pienennä tekstiä.</p>
              )}
            </>
          )}
          <div className="paper-note-style">
            <label>
              Väri
              <MarkupColor
                label="Arkkimerkinnän väri"
                value={source?.color ?? editing.color}
                disabled={busy}
                onPreview={(color) => setDraft(color ? { ...editing, color } : undefined)}
                onCommit={(color) => void save({ ...editing, color })}
              />
            </label>
            <label>
              Leveys (mm)
              <input
                type="number"
                aria-label="Arkkimerkinnän leveys"
                min="4"
                max="277"
                key={editing.id + ':' + editing.width}
                defaultValue={editing.width.toFixed(1)}
                onBlur={(e) => {
                  const width = Number(e.target.value);
                  if (Number.isFinite(width) && width !== editing.width)
                    void save({ ...editing, width });
                }}
              />
            </label>
          </div>
          {editing.kind === 'highlight' && (
            <HighlightStyleFields
              value={{
                ...editing,
                lineStyle: editing.lineStyle ?? 'dashed',
                lineWidth: editing.lineWidth ?? 1,
                fillOpacity: editing.fillOpacity ?? 0.15,
              }}
              disabled={busy}
              onChange={(patch) => void save({ ...editing, ...patch })}
            />
          )}
          <button className="button subtle" onClick={() => void remove(editing.id)}>
            <Trash2 size={14} />
            Poista merkintä
          </button>
        </fieldset>
      )}
      {!!marks.length && (
        <details open className="paper-note-list">
          <summary>Arkin huomiot ({marks.length})</summary>
          {marks.map((m) => (
            <div key={m.id} className={selected === m.id ? 'is-selected' : ''}>
              <button
                onClick={() => {
                  onActivate?.();
                  setSelected(m.id);
                  setDraft(undefined);
                  if (m.kind === 'note') setFocus((n) => n + 1);
                }}
              >
                {m.kind === 'note' ? <MessageSquareText size={14} /> : <Highlighter size={14} />}
                <span>{m.text.split('\n')[0] || 'Aluekorostus'}</span>
              </button>
              <button
                aria-label={m.hidden ? 'Näytä arkkimerkintä' : 'Piilota arkkimerkintä'}
                disabled={busy}
                onClick={() => void save({ ...m, hidden: !m.hidden })}
              >
                {m.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                aria-label="Poista arkkimerkintä"
                disabled={busy}
                onClick={() => void remove(m.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
  return {
    events,
    toolbar,
    controls,
    mode,
    exportable,
    decorate: (sheet: Sheet, forExport = false) =>
      annotateSheet(sheet, displayed, forExport ? undefined : selected),
  };
}
