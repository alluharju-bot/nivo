import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Plus, Save, Trash2 } from 'lucide-react';
import type { CadClient } from '../cad/client';
import { uid, type Project } from '../model/project';
import {
  drawingSheetSchema,
  sheetViewKey,
  type DrawingSheet,
  type SheetView,
} from '../model/drawingSheets';
import { addOverallDimensions } from '../model/dimensions';
import {
  createMultiSheet,
  multiSheetScale,
  sheetProject,
  sheetScales,
  sheetViewLabel,
  type SheetProjection,
} from './sheets';
import { exportDrawingPDF } from './export';
import { downloadFile, safeFilename } from '../storage/projects';

const defaultViews: SheetView[] = [
  { kind: 'standard', view: 'front' },
  { kind: 'standard', view: 'right' },
  { kind: 'standard', view: 'top' },
];
export function SheetWorkspace({
  project,
  cad,
  busy,
  selectedIds,
  selectedGroupId,
  onCommit,
  onBack,
}: {
  project: Project;
  cad: CadClient;
  busy: boolean;
  selectedIds: string[];
  selectedGroupId?: string;
  onCommit: (project: Project, message: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const fresh = (): DrawingSheet => ({
    id: uid(),
    name: 'Mittakuvat',
    views: defaultViews,
    hidden: false,
    scope: selectedGroupId
      ? { kind: 'group', groupId: selectedGroupId }
      : selectedIds.length
        ? { kind: 'parts', ids: [...selectedIds] }
        : { kind: 'visible' },
  });
  const [draft, setDraft] = useState<DrawingSheet>(() => project.drawingSheets?.[0] ?? fresh());
  const saved = project.drawingSheets?.find((s) => s.id === draft.id);
  const [result, setResult] = useState<{
    key: string;
    projections: Map<string, SheetProjection>;
  }>();
  const [error, setError] = useState(''),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);
  const scope = useMemo(() => sheetProject(project, draft), [project, draft.scope]);
  const key = JSON.stringify([
    project.id,
    scope.project.bodies.map((b) => [b.id, b.origin, b.feature, b.purpose]),
    draft.views.map((v) =>
      v.kind === 'standard'
        ? v
        : [
            v,
            project.sections?.find((s) => s.id === v.sectionId)?.frame,
            project.sections?.find((s) => s.id === v.sectionId)?.flipped,
          ],
    ),
  ]);
  useEffect(() => {
    let active = true;
    setError('');
    if (scope.missing) {
      setResult(undefined);
      return;
    }
    const build = async () => {
      const projections = new Map<string, SheetProjection>();
      for (const view of draft.views) {
        if (!active) return;
        if (view.kind === 'standard')
          projections.set(sheetViewKey(view), {
            kind: 'standard',
            projection: await cad.project(scope.project.bodies, view.view),
          });
        else {
          const section = project.sections?.find((s) => s.id === view.sectionId);
          if (section)
            projections.set(sheetViewKey(view), {
              kind: 'section',
              result: await cad.section(scope.project.bodies, section, true),
            });
        }
      }
      if (active) setResult({ key, projections });
    };
    void build().catch((e) => {
      if (active) {
        setError(e.message);
        setResult(undefined);
      }
    });
    return () => {
      active = false;
    };
  }, [key, cad, scope.missing]);
  const projections = result?.key === key ? result.projections : undefined;
  const scale = useMemo(
    () => draft.scale ?? (projections ? multiSheetScale(project, draft, projections) : 1),
    [project, draft, projections],
  );
  const sheet = useMemo(
    () => (projections ? createMultiSheet(project, draft, projections, scale) : undefined),
    [project, draft, projections, scale],
  );
  const valid = drawingSheetSchema.safeParse(draft).success;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const canExport =
    !!sheet?.fits && !sheet.orphanCount && !scope.missing && valid && !busy && !exporting;
  const viewOptions: SheetView[] = [
    ...defaultViews,
    ...(project.sections ?? []).map((s) => ({ kind: 'section' as const, sectionId: s.id })),
  ];
  const scopeValue =
    draft.scope.kind === 'group' ? `group:${draft.scope.groupId}` : draft.scope.kind;
  const persist = async () => {
    if (!valid || busy) return;
    await onCommit(
      {
        ...project,
        drawingSheets: saved
          ? project.drawingSheets!.map((s) => (s.id === draft.id ? draft : s))
          : [...(project.drawingSheets ?? []), draft],
      },
      'Mitta-arkki tallennettu. Näkymät päivittyvät mallista.',
    );
  };
  const addDimensions = async () => {
    const target =
      draft.scope.kind === 'group'
        ? draft.scope
        : { kind: 'parts' as const, ids: scope.project.bodies.map((b) => b.id) };
    const next = addOverallDimensions(project, target, ['x', 'y', 'z']);
    if (next.dimensions.length !== project.dimensions.length)
      await onCommit(next, 'Arkin kohteen kokonaismitat lisätty.');
  };
  const download = async (pdf: boolean) => {
    if (!canExport || !sheet) return;
    setExporting(true);
    setError('');
    try {
      const name = `${project.name}-${draft.name}`;
      if (pdf) await exportDrawingPDF(sheet, name);
      else downloadFile(sheet.svg, `${safeFilename(name)}.svg`, 'image/svg+xml');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="drawing-studio" aria-label="Mitta-arkit">
      <div className="drawing-sheet-column">
        <div className="drawing-view-tabs">
          <button onClick={onBack}>
            <ArrowLeft size={14} /> Yksittäiset mittakuvat
          </button>
          <span>A4 · Yhteinen mittakaava 1:{scale}</span>
        </div>
        <p className="drawing-step" role="status">
          Kokoa näkymät samalle arkille. Lisää yksityiskohtaiset mitat yksittäisessä mittakuvassa.
        </p>
        <div className="drawing-area" data-testid="multi-sheet-area">
          {error && (
            <p className="drawing-warning" role="alert">
              {error}
            </p>
          )}
          {scope.missing && (
            <p className="drawing-warning" role="alert">
              Arkin kohde on tyhjä tai siitä puuttuu osia. Valitse kohde uudelleen.
            </p>
          )}
          {!scope.missing && !sheet && !error && <p role="status">Muodostetaan arkin näkymiä…</p>}
          {sheet && !sheet.fits && (
            <p className="drawing-warning" role="alert">
              Kaikki näkymät eivät mahdu arkille tai näkymän kohde puuttuu.{' '}
              <button onClick={() => setDraft({ ...draft, scale: undefined })}>
                Sovita arkille
              </button>
            </p>
          )}
          {!!sheet?.orphanCount && (
            <p className="drawing-warning" role="alert">
              Näkymissä on puuttuvia tai muuttuneita viitteitä. Korjaa ne yksittäisessä mittakuvassa
              ennen vientiä.
            </p>
          )}
          {sheet && (
            <div className="drawing-paper" dangerouslySetInnerHTML={{ __html: sheet.svg }} />
          )}
        </div>
      </div>
      <aside className="drawing-controls" aria-label="Mitta-arkin toiminnot">
        <label>
          Arkki
          <select
            aria-label="Tallennettu mitta-arkki"
            value={saved ? draft.id : 'new'}
            onChange={(e) => {
              const next = project.drawingSheets?.find((s) => s.id === e.target.value);
              setDraft(next ?? fresh());
            }}
          >
            <option value="new">Uusi arkki</option>
            {project.drawingSheets?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Arkin nimi
          <input
            aria-label="Arkin nimi"
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Kohde
          <select
            aria-label="Mitta-arkin kohde"
            value={scopeValue}
            onChange={(e) => {
              const value = e.target.value;
              setDraft({
                ...draft,
                scope:
                  value === 'visible'
                    ? { kind: 'visible' }
                    : value === 'parts'
                      ? { kind: 'parts', ids: [...selectedIds] }
                      : { kind: 'group', groupId: value.slice(6) },
              });
            }}
          >
            <option value="visible">Kaikki näkyvät osat</option>
            <option value="parts" disabled={!selectedIds.length && draft.scope.kind !== 'parts'}>
              Osavalinta (
              {draft.scope.kind === 'parts' ? draft.scope.ids.length : selectedIds.length})
            </option>
            {draft.scope.kind === 'group' &&
              !project.groups.some(
                (g) => draft.scope.kind === 'group' && g.id === draft.scope.groupId,
              ) && <option value={scopeValue}>Puuttuva ryhmä</option>}
            {project.groups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {draft.scope.kind === 'parts' && !!selectedIds.length && (
          <button
            className="button subtle full"
            onClick={() => setDraft({ ...draft, scope: { kind: 'parts', ids: [...selectedIds] } })}
          >
            Käytä nykyistä mallin valintaa
          </button>
        )}
        <fieldset className="sheet-view-options">
          <legend>Näkymät</legend>
          {viewOptions.map((v) => {
            const key = sheetViewKey(v),
              checked = draft.views.some((w) => sheetViewKey(w) === key);
            return (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked ? draft.views.length === 1 : draft.views.length >= 6}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      views: checked
                        ? draft.views.filter((w) => sheetViewKey(w) !== key)
                        : [...draft.views, v],
                    })
                  }
                />
                {sheetViewLabel(project, v)}
              </label>
            );
          })}
          {draft.views
            .filter(
              (v) => v.kind === 'section' && !project.sections?.some((s) => s.id === v.sectionId),
            )
            .map((v) => (
              <button
                key={sheetViewKey(v)}
                className="button subtle full"
                disabled={draft.views.length === 1}
                onClick={() => setDraft({ ...draft, views: draft.views.filter((w) => w !== v) })}
              >
                Poista puuttuva leikkauskuva
              </button>
            ))}
          <p className="muted">Enintään 6 näkymää. Kaikissa sama mittakaava.</p>
        </fieldset>
        <button
          className="button outlined full"
          disabled={busy || scope.missing}
          onClick={() => void addDimensions()}
        >
          Lisää kokonaismitat
        </button>
        <label>
          Mittakaava
          <select
            aria-label="Arkin yhteinen mittakaava"
            value={draft.scale ?? 'auto'}
            onChange={(e) =>
              setDraft({
                ...draft,
                scale: e.target.value === 'auto' ? undefined : Number(e.target.value),
              })
            }
          >
            <option value="auto">Sovita · 1:{scale}</option>
            {sheetScales.map((s) => (
              <option key={s} value={s}>
                1:{s}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.hidden}
            onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })}
          />
          Näytä piiloviivat
        </label>
        <button
          className="button outlined full"
          disabled={
            busy || !valid || !dirty || (!saved && (project.drawingSheets?.length ?? 0) >= 50)
          }
          onClick={() => void persist()}
        >
          <Save size={15} />
          {saved && !dirty ? 'Arkki tallessa' : 'Tallenna arkki'}
        </button>
        <div className="dimension-buttons">
          <button className="button subtle" onClick={() => setDraft(fresh())}>
            <Plus size={14} /> Uusi arkki
          </button>
          {saved && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={async () => {
                if (
                  await onCommit(
                    {
                      ...project,
                      drawingSheets: project.drawingSheets?.filter((s) => s.id !== draft.id),
                    },
                    'Mitta-arkki poistettu. Malli ja mitat säilyivät.',
                  )
                )
                  setDraft(fresh());
              }}
            >
              <Trash2 size={14} /> Poista arkki
            </button>
          )}
        </div>
        <div className="drawing-export">
          <button
            className="button dark full"
            disabled={!canExport}
            onClick={() => void download(true)}
          >
            <Download size={15} />
            {exporting ? 'Luodaan tiedostoa…' : 'Vie PDF'}
          </button>
          <button
            className="button subtle full"
            disabled={!canExport}
            onClick={() => void download(false)}
          >
            Vie SVG
          </button>
          <p className="muted">A4 vaaka · tulosta 100 % koossa.</p>
        </div>
      </aside>
    </section>
  );
}
