import { useMemo, useState } from 'react';
import { SelectionDialog } from './SelectionDialog';
import { newDistribution, planDistribution } from '../model/distribution';
import type { Distribution, DistributionOptions } from '../model/distributionSchema';
import type { Project } from '../model/project';
import { formatLength, parseLength } from '../model/units';

export function DistributionDialog({
  project,
  initial,
  selection,
  groupId,
  openedAssembly,
  editing,
  busy,
  error,
  onApply,
  onClose,
  onRelease,
}: {
  project: Project;
  initial: Distribution;
  selection: string[];
  groupId?: string;
  openedAssembly?: string;
  editing: boolean;
  busy: boolean;
  error?: string;
  onApply: (series: Distribution, cut?: boolean) => void;
  onClose: () => void;
  onRelease: () => void;
}) {
  const [series, setSeries] = useState(initial);
  const [value, setValue] = useState(String(initial.options.value));
  const [count, setCount] = useState(
    String(initial.options.count - (initial.kind === 'guides' ? 1 : 0)),
  );
  const [modeError, setModeError] = useState('');
  const lines = series.kind === 'guides';
  const availability = useMemo(
    () =>
      Object.fromEntries(
        (['copy', 'arrange'] as const).map((mode) => {
          try {
            newDistribution(project, initial.kind, selection, mode, groupId, openedAssembly);
            return [mode, true];
          } catch {
            return [mode, false];
          }
        }),
      ),
    [project, initial.kind, selection, groupId, openedAssembly],
  );
  const result = useMemo(() => {
    try {
      if (!/^\d+$/.test(count)) throw new Error('Anna määrä kokonaislukuna.');
      const options = {
        ...series.options,
        value: parseLength(value, false, series.options.measure === 'gap'),
        count: Number(count) + (lines ? 1 : 0),
      };
      return { options, plan: planDistribution(project, series, options) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [series, count, value, project, lines]);
  const patch = (options: Partial<DistributionOptions>) =>
    setSeries({ ...series, options: { ...series.options, ...options } });
  const apply = (cut = false) => {
    if (result.options && !busy) onApply({ ...series, options: result.options }, cut);
  };
  const firstId = series.members[0].ids[0];
  const firstName = lines
    ? 'Ensimmäinen viiva'
    : project.bodies.find((b) => b.id === firstId)?.name;
  const isGap = ['extent', 'gap'].includes(series.options.measure);
  const positions = result.plan?.placements ?? [];
  const low = Math.min(...positions.map((p) => p.min)),
    high = Math.max(...positions.map((p) => p.max));
  const x = (value: number) => 18 + ((value - low) / Math.max(high - low, 1e-9)) * 284;
  return (
    <SelectionDialog
      side
      title={editing ? 'Muokkaa tasajakoa' : 'Tasajako'}
      onClose={onClose}
      onAccept={() => apply()}
    >
      {editing && (
        <p className="tool-consequence">
          Muokkaus koskee koko tasajakoa: {initial.members.length}{' '}
          {lines ? 'viivaa' : 'osaa tai valintaa'}.
        </p>
      )}
      <div className="distribution-fields">
        {!editing && (
          <label className="modeling-field">
            Toiminto
            <select
              aria-label="Tasajaon toiminto"
              value={series.mode}
              disabled={busy}
              onChange={(e) => {
                try {
                  const next = newDistribution(
                    project,
                    series.kind,
                    selection,
                    e.target.value as Distribution['mode'],
                    groupId,
                    openedAssembly,
                  );
                  setSeries(next);
                  setValue(String(next.options.value));
                  setCount(String(next.options.count - (lines ? 1 : 0)));
                  setModeError('');
                } catch (e) {
                  setModeError((e as Error).message);
                }
              }}
            >
              <option value="copy" disabled={!availability.copy}>
                {lines ? 'Jaa väli viivoilla' : 'Kopioi valinta'}
              </option>
              <option value="arrange" disabled={!availability.arrange}>
                Järjestä valitut
              </option>
            </select>
          </label>
        )}
        <label className="modeling-field">
          {lines
            ? 'Välejä'
            : series.members[0].ids.length > 1 && series.mode === 'copy'
              ? 'Valintoja yhteensä'
              : 'Osia yhteensä'}
          <input
            aria-label={lines ? 'Tasajaon välien määrä' : 'Tasajaon määrä'}
            inputMode="numeric"
            value={count}
            disabled={busy || series.mode === 'arrange'}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label className="modeling-field">
          Mitta
          <select
            aria-label="Tasajaon mittatapa"
            value={series.options.measure}
            disabled={busy}
            onChange={(e) => patch({ measure: e.target.value as DistributionOptions['measure'] })}
          >
            {!lines && <option value="extent">Kokonaismitta · ulkoreunat</option>}
            <option value="span">{lines ? 'Kokonaismitta' : 'Kokonaismitta · viitekohdat'}</option>
            <option value="step">Jakoväli</option>
            {!lines && <option value="gap">Vapaa väli</option>}
          </select>
        </label>
        <label className="modeling-field">
          {['span', 'extent'].includes(series.options.measure)
            ? 'Kokonaismitta'
            : series.options.measure === 'gap'
              ? 'Vapaa väli'
              : 'Jakoväli'}{' '}
          · mm
          <input
            aria-label="Tasajaon mitta"
            inputMode="decimal"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label className="modeling-field">
          Suunta
          <select
            aria-label="Tasajaon suunta"
            value={`${series.options.reverse ? '-' : ''}${series.options.axis}`}
            disabled={busy}
            onChange={(e) =>
              patch({
                axis: e.target.value.slice(-1) as DistributionOptions['axis'],
                reverse: e.target.value.startsWith('-'),
              })
            }
          >
            {['x', 'y', 'z'].flatMap((a) => [
              <option key={a} value={a}>
                {a.toUpperCase()} +
              </option>,
              <option key={`-${a}`} value={`-${a}`}>
                {a.toUpperCase()} −
              </option>,
            ])}
          </select>
        </label>
        {!lines && !isGap && (
          <label className="modeling-field">
            Viitekohta
            <select
              aria-label="Tasajaon viitekohta"
              value={series.options.reference}
              disabled={busy}
              onChange={(e) =>
                patch({ reference: e.target.value as DistributionOptions['reference'] })
              }
            >
              <option value="min">
                {series.options.axis === 'z' ? 'Alareuna' : 'Alkureuna (−)'}
              </option>
              <option value="center">Keskipiste</option>
              <option value="max">
                {series.options.axis === 'z' ? 'Yläreuna' : 'Loppureuna (+)'}
              </option>
            </select>
          </label>
        )}
      </div>
      <p className="tool-consequence">
        Alku: {firstName}. Ensimmäinen {lines ? 'viiva' : 'osa tai valinta'} pysyy paikallaan.
      </p>
      {result.plan && (
        <div className="distribution-preview" aria-label="Tasajaon kaavio">
          <svg
            viewBox="0 0 320 82"
            role="img"
            aria-label={`${positions.length} ${lines ? 'viivaa' : 'osaa'}, kokonaismitta ${formatLength(result.plan.extent)} mm`}
          >
            <path d="M18 60 H302 M18 55 V65 M302 55 V65" fill="none" stroke="currentColor" />
            {positions.map((p, i) => (
              <g key={i}>
                <rect
                  x={x(p.min) - (lines ? 1 : 0)}
                  y="23"
                  width={Math.max(lines ? 2 : 1, x(p.max) - x(p.min))}
                  height="26"
                  rx="1"
                />
                {positions.length <= 20 && (
                  <text x={x((p.min + p.max) / 2)} y="15" textAnchor="middle">
                    {i + 1}
                  </text>
                )}
              </g>
            ))}
            <text x="160" y="77" textAnchor="middle">
              {formatLength(result.plan.extent)} mm
            </text>
          </svg>
          <p role="status">
            {lines
              ? `${positions.length} viivaa · ${positions.length - 1} väliä · ${formatLength(result.plan.span / (positions.length - 1))} mm / väli`
              : `Vapaa väli ${formatLength(result.plan.gapMin)}${Math.abs(result.plan.gapMax - result.plan.gapMin) > 1e-6 ? `–${formatLength(result.plan.gapMax)}` : ''} mm`}
          </p>
          {!lines && result.plan.gapMin < -1e-6 && (
            <p>Osat menevät osittain päällekkäin. Ulkoreunojen kokonaismitta huomioi paksuudet.</p>
          )}
        </div>
      )}
      {(result.error || modeError || error) && (
        <p role="alert">{result.error || modeError || error}</p>
      )}
      {lines ? (
        <p className="tool-consequence">Molemmat rajaviivat mukana: 5 väliä = 6 viivaa.</p>
      ) : (
        <p className="tool-consequence">
          {isGap
            ? 'Paksuudet huomioidaan. Osien väliin jää yhtä suuri vapaa tila.'
            : 'Mitta kulkee valitusta viitekohdasta samaan kohtaan seuraavassa osassa.'}{' '}
          {series.mode === 'copy'
            ? 'Alkuperäinen sisältyy määrään. Kopiot ovat linkitettyjä.'
            : 'Järjestäminen säilyttää kaikki valitut osat.'}
        </p>
      )}
      <button className="button dark full" disabled={busy || !result.plan} onClick={() => apply()}>
        {busy ? 'Toteutetaan…' : 'Toteuta tasajako'}
      </button>
      {!lines && (
        <button
          className="button outlined full"
          disabled={busy || !result.plan}
          onClick={() => apply(true)}
        >
          Toteuta ja käytä leikkureina
        </button>
      )}
      <button className="button outlined full" onClick={onClose}>
        {busy ? 'Keskeytä' : 'Peruuta'}
      </button>
      {editing && (
        <button className="button subtle full" disabled={busy} onClick={onRelease}>
          Vapauta tasajako · säilytä osat
        </button>
      )}
      {!lines && (
        <p className="tool-consequence">
          Muotoja voi käyttää Cutin työstökappaleina. Jaon muuttaminen myöhemmin ei muuta jo
          leikattuja reikiä.
        </p>
      )}
    </SelectionDialog>
  );
}
