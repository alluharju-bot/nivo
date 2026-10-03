import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { Body, Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { cutDefaults, type CutOverride, type CutSettings } from '../model/cutSettings';
import {
  createCutPlan,
  cutGeometryKey,
  cutSettingsError,
  cuttingParts,
  type CutPart,
} from '../model/cutting';
import { cutListSVGs, cutSheetSVG, cuttingCSV, exportCutPDF } from '../drawing/cutting';
import { downloadFile, safeFilename } from '../storage/projects';
import { formatLength as mm, parseLength } from '../model/units';

const stockPresets = [
  [2800, 2070],
  [2440, 1220],
  [2500, 1250],
  [3050, 1220],
];
const fields = (s: CutSettings) => ({
  length: String(s.length),
  width: String(s.width),
  kerf: String(s.kerf),
  margin: String(s.margin),
});

export function CutWorkspace({
  project,
  bodies,
  meshes,
  title,
  onSettings,
}: {
  project: Project;
  bodies: Body[];
  meshes: BodyMesh[];
  title: string;
  onSettings: (settings: CutSettings) => Promise<boolean>;
}) {
  const settings = project.settings.cutting ?? cutDefaults;
  const [draft, setDraft] = useState(() => fields(settings));
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setDraft(fields(settings));
  }, [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(fields(settings));
  const parts = useMemo(
    () => cuttingParts(project, bodies, meshes, settings),
    [project, bodies, meshes, settings],
  );
  const result = useMemo(() => {
    const issue = cutSettingsError(settings);
    return issue ? { issue } : { plan: createCutPlan(parts, settings) };
  }, [parts, settings]);
  const plan = result.plan;
  const active = parts.find((p) => p.id === selected);
  const sheets = useMemo(
    () =>
      plan?.sheets.map((s) => cutSheetSVG(s, settings, title, plan.unplaced.length, selected)) ??
      [],
    [plan, settings, title, selected],
  );
  const lists = useMemo(
    () => (plan ? cutListSVGs(parts, plan, settings, title) : []),
    [parts, plan, settings, title],
  );
  const update = async (next: CutSettings) => {
    const issue = cutSettingsError(next);
    if (issue) {
      setError(issue);
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const ok = await onSettings(next);
      if (!ok) setError('Leikkausasetusten tallennus epäonnistui.');
      return ok;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const updatePart = (id: string, value: CutOverride) =>
    update({ ...settings, parts: { ...settings.parts, [id]: value } });
  const sheetFor = new Map(
    plan?.sheets.flatMap((s) => s.placements.map((p) => [p.part.id, s.number] as const)),
  );
  const exportDisabled = !parts.length || busy || exporting || dirty || !plan;
  return (
    <div className="cut-workspace">
      <main className="cut-preview">
        <div className="cut-summary">
          <div>
            <h2>Leikkauslista</h2>
            <p>{title}</p>
          </div>
          {plan && (
            <div className="cut-statistics" aria-label="Leikkauslistan yhteenveto">
              <strong>
                {plan.sheets.length} <small>{plan.sheets.length === 1 ? 'levy' : 'levyä'}</small>
              </strong>
              <strong>
                {sheetFor.size} / {parts.length} <small>osaa</small>
              </strong>
              <strong>
                {mm(plan.stockArea ? (plan.usedArea / plan.stockArea) * 100 : 0)} %{' '}
                <small>käyttöaste</small>
              </strong>
            </div>
          )}
        </div>
        {!!plan?.unplaced.length && (
          <div className="cut-warning" role="status">
            <strong>{plan.unplaced.length} osaa odottaa tarkistusta</strong>
            <p>
              Valitse osa listasta: kasvata levykokoa, tarkista syysuunta tai anna aihion mitat.
            </p>
            {plan.unplaced.map(({ part, reason }) => (
              <button key={part.id} onClick={() => setSelected(part.id)}>
                #{part.number} {part.name} — {reason}
              </button>
            ))}
          </div>
        )}
        {dirty && (
          <p className="cut-warning">Levyn asetukset muuttuivat. Päivitä asettelu ennen vientiä.</p>
        )}
        {!parts.length && (
          <p className="cut-empty">
            Tässä kokoonpanossa ei ole kiinteitä osia. Mallinna levyt erillisinä osina tai luo
            kaappi Levyrunko-työkalulla.
          </p>
        )}
        <div className="cut-sheets">
          {sheets.map((svg, i) => (
            <div
              className="cut-paper"
              key={i}
              data-testid="cut-sheet"
              onClick={(e) => {
                const id = (e.target as Element)
                  .closest('[data-cut-part]')
                  ?.getAttribute('data-cut-part');
                if (id) setSelected(id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const id = (e.target as Element)
                    .closest('[data-cut-part]')
                    ?.getAttribute('data-cut-part');
                  if (id) {
                    e.preventDefault();
                    setSelected(id);
                  }
                }
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
        </div>
        {!!parts.length && (
          <section className="cut-part-list" aria-label="Leikattavat osat">
            <h3>Numeroitu osalista</h3>
            <p>Valitse osa kuvasta tai listasta. Numerot ovat samat räjäytyskuvassa.</p>
            <div className="cut-table-scroll">
              <table className="parts-table cut-table">
                <thead>
                  <tr>
                    <th>Nro / osa</th>
                    <th>Aihio: P × L × paksuus (mm)</th>
                    <th>Levy</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id} data-selected={selected === p.id}>
                      <td>
                        <button
                          aria-label={`Leikkausosa: ${p.name}`}
                          onClick={() => setSelected(p.id)}
                        >
                          <strong>
                            {p.number}. {p.name}
                          </strong>
                          <small>{[p.group, p.material].filter(Boolean).join(' · ')}</small>
                        </button>
                      </td>
                      <td>
                        {p.dimensions?.map(mm).join(' × ') ?? 'Anna aihion mitat'}
                        <small>
                          {p.manual ? 'Käsin annettu aihio · ' : ''}Syyt:{' '}
                          {{ free: 'vapaa', length: 'pituus', width: 'leveys' }[p.grain]}
                        </small>
                      </td>
                      <td>{!p.included ? 'Ei mukana' : (sheetFor.get(p.id) ?? 'Tarkista')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <div className="cut-print-lists">
          {lists.map((svg, i) => (
            <div className="cut-paper" key={i} dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
      </main>
      <aside className="parts-list-panel cut-settings" aria-label="Leikkausasetukset">
        {(error || result.issue) && (
          <p className="cut-warning" role="alert">
            {error || result.issue}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              void update({
                ...settings,
                length: parseLength(draft.length),
                width: parseLength(draft.width),
                kerf: parseLength(draft.kerf, false, true),
                margin: parseLength(draft.margin, false, true),
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>Levy ja sahaus</legend>
            <label>
              Levykoko
              <select
                aria-label="Levykoko"
                value={
                  stockPresets.some(
                    ([l, w]) => String(l) === draft.length && String(w) === draft.width,
                  )
                    ? `${draft.length}x${draft.width}`
                    : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  const [length, width] = e.target.value.split('x');
                  setDraft({ ...draft, length, width });
                }}
              >
                <option value="custom" disabled>
                  Oma levykoko
                </option>
                {stockPresets.map(([l, w]) => (
                  <option key={l} value={`${l}x${w}`}>
                    {mm(l)} × {mm(w)} mm
                  </option>
                ))}
              </select>
            </label>
            <div className="cut-field-grid">
              {(
                [
                  ['length', 'Levyn pituus'],
                  ['width', 'Levyn leveys'],
                  ['kerf', 'Sahausura'],
                  ['margin', 'Reunavara'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label} (mm)
                  <input
                    aria-label={label}
                    inputMode="decimal"
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <p className="muted">
              Reunavara jätetään joka reunaan. Sahausura varataan osien väliin. Levyn pituus on
              kuvan vaakasuunta.
            </p>
            <button type="submit" className="button dark full" disabled={!dirty}>
              {busy ? 'Päivitetään…' : 'Päivitä asettelu'}
            </button>
          </fieldset>
        </form>
        {active && (
          <CutPartEditor
            key={`${active.id}:${JSON.stringify(settings.parts?.[active.id])}:${cutGeometryKey(bodies.find((b) => b.id === active.id)!)}`}
            part={active}
            body={bodies.find((b) => b.id === active.id)!}
            override={settings.parts?.[active.id] ?? {}}
            busy={busy || dirty}
            onChange={(value) => updatePart(active.id, value)}
            onError={setError}
          />
        )}
        {!active && !!parts.length && (
          <p className="cut-hint">
            Valitse osa, kun haluat muuttaa sen syysuuntaa, aihiomittoja tai levymateriaalia.
          </p>
        )}
        <div className="cut-export">
          <button
            className="button dark full"
            disabled={exportDisabled}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Tulosta leikkauslista
          </button>
          <button
            className="button outlined full"
            disabled={exportDisabled}
            onClick={async () => {
              setExporting(true);
              setError('');
              try {
                await exportCutPDF(
                  [
                    ...(plan?.sheets.map((s) =>
                      cutSheetSVG(s, settings, title, plan.unplaced.length),
                    ) ?? []),
                    ...lists,
                  ],
                  title,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download size={16} />
            {exporting ? 'Luodaan PDF…' : 'Tallenna PDF'}
          </button>
          <button
            className="button outlined full"
            disabled={exportDisabled}
            onClick={() =>
              downloadFile(
                cuttingCSV(parts, plan!),
                `${safeFilename(title)}-leikkauslista.csv`,
                'text/csv;charset=utf-8',
              )
            }
          >
            Vie leikkauslista CSV
          </button>
        </div>
        <p className="muted">
          Eri materiaalit, värit ja paksuudet sijoitetaan erillisille levyille. Asettelu etsii
          vähäistä hukkaa suorilla sahauksilla. Harmaat jäännöspalat voi hyödyntää myöhemmin.
        </p>
        <p className="muted">
          Syysuunta valitaan osalle erikseen; sitä ei lueta tekstuurin asennosta. Aihiomittoihin ei
          tehdä reunalista- tai koneistusvähennyksiä.
        </p>
      </aside>
    </div>
  );
}

function CutPartEditor({
  part,
  body,
  override,
  busy,
  onChange,
  onError,
}: {
  part: CutPart;
  body: Body;
  override: CutOverride;
  busy: boolean;
  onChange: (value: CutOverride) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [sizes, setSizes] = useState(
    (override.blank?.dimensions ?? part.dimensions ?? ['', '', '']).map(String),
  );
  const [stock, setStock] = useState(override.stock ?? '');
  const [included, setIncluded] = useState(part.included);
  const [grain, setGrain] = useState(part.grain);
  return (
    <fieldset className="cut-part-editor" disabled={busy}>
      <legend>
        #{part.number} {part.name}
      </legend>
      <label className="cut-checkbox">
        <input
          type="checkbox"
          checked={included}
          onChange={async (e) => {
            const next = e.target.checked;
            setIncluded(next);
            if (!(await onChange({ ...override, included: next }))) setIncluded(part.included);
          }}
        />
        Mukana leikkauslistassa
      </label>
      <label>
        Syysuunta
        <select
          aria-label="Osan syysuunta"
          value={grain}
          onChange={async (e) => {
            const next = e.target.value as CutPart['grain'];
            setGrain(next);
            if (!(await onChange({ ...override, grain: next }))) setGrain(part.grain);
          }}
        >
          <option value="free">Vapaa · saa kääntää 90°</option>
          <option value="length">Osan pituus levyn pituuteen</option>
          <option value="width">Osan leveys levyn pituuteen</option>
        </select>
      </label>
      <details open={part.issue ? true : undefined}>
        <summary>Aihio ja levymateriaali</summary>
        {part.issue && <p className="cut-warning">{part.issue}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const dimensions = sizes.map((s) => parseLength(s)) as [number, number, number];
              void onChange({
                ...override,
                blank: { dimensions, geometryKey: cutGeometryKey(body) },
              });
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          {['Aihion pituus', 'Aihion leveys', 'Aihion paksuus'].map((label, i) => (
            <label key={label}>
              {label} (mm)
              <input
                required
                aria-label={label}
                inputMode="decimal"
                value={sizes[i]}
                onChange={(e) => setSizes(sizes.map((s, j) => (j === i ? e.target.value : s)))}
              />
            </label>
          ))}
          <p>
            Oma aihio ei muuta mallia. Anna sahattava ulkomitta; aukot ja muut työstöt tehdään
            erikseen.
          </p>
          <button type="submit" className="button outlined full">
            Käytä aihion mittoja
          </button>
          {override.blank && (
            <button
              type="button"
              className="button text full"
              onClick={() => void onChange({ ...override, blank: undefined })}
            >
              Palauta mitat mallista
            </button>
          )}
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onChange({ ...override, stock: stock.trim() || undefined });
          }}
        >
          <label>
            Levymateriaalin nimi
            <input
              aria-label="Levymateriaalin nimi"
              maxLength={80}
              value={stock}
              placeholder={part.material}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>
          <p>
            Sama nimi yhdistää samanpaksuiset osat samalle levylle myös eri pintaväreillä. Tyhjä
            käyttää mallin materiaalia.
          </p>
          <button type="submit" className="button outlined full">
            Aseta levymateriaali
          </button>
        </form>
      </details>
    </fieldset>
  );
}
