import { useEffect, useRef, useState } from 'react';
import { featureIsSolid, type Body } from '../model/project';
import type { CadClient } from '../cad/client';
import type { EdgeDetailResult } from '../cad/protocol';
import type { SurfaceLevelsResult } from '../cad/surfaceLevels';
import { parseLength, formatLength } from '../model/units';
const lengthValue = (value: string) => {
  try {
    return parseLength(value.trim() || '0', true, true);
  } catch {
    return NaN;
  }
};

export function SurfaceLevelsPanel({
  bodies,
  ids,
  onIds,
  existing,
  cad,
  busy,
  onPreview,
  onCommit,
  onClose,
}: {
  bodies: Body[];
  ids: string[];
  onIds: (ids: string[]) => void;
  existing?: Body;
  cad: CadClient;
  busy: boolean;
  onPreview: (r?: EdgeDetailResult) => void;
  onCommit: (r: SurfaceLevelsResult, ids: string[], hide: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const saved = existing?.feature.type === 'brep' ? existing.feature.surfaceLevels : undefined;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(saved?.boundaries.map((b, i) => [String(i), String(b.height)]) ?? []),
  );
  const [depth, setDepth] = useState(String(saved?.baseDepth ?? 0));
  const [open, setOpen] = useState(saved?.openCenter ?? true);
  const [hide, setHide] = useState(true);
  const [name, setName] = useState(existing?.name ?? 'Korkeuspinta');
  const [state, setState] = useState<{ key: string; result?: SurfaceLevelsResult; error?: string }>(
    { key: '' },
  );
  const generation = useRef(0);
  const profiles = ids.map((id) => bodies.find((b) => b.id === id)).filter((b): b is Body => !!b);
  const rows = saved ? saved.boundaries.map((b, i) => ({ id: String(i), name: b.name })) : profiles;
  const heights = rows.map((r, i) => lengthValue(values[r.id] ?? String(-i * 10)));
  const options = { heights, baseDepth: lengthValue(depth), openCenter: open, name };
  const key = JSON.stringify([profiles, existing, values, depth, open]);
  const result = key === state.key ? state.result : undefined;
  const error = key === state.key ? state.error : undefined;
  const valid = heights.every(Number.isFinite) && Number.isFinite(options.baseDepth);
  useEffect(() => {
    const request = ++generation.current;
    onPreview(undefined);
    if (rows.length < 2 || !valid) return;
    const timer = setTimeout(() => {
      void cad
        .surfaceLevels(profiles, options, existing)
        .then((result) => {
          if (generation.current !== request) return;
          setState({ key, result });
          onPreview(result);
        })
        .catch((e: Error) => {
          if (generation.current === request) setState({ key, error: e.message });
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      generation.current++;
      onPreview(undefined);
    };
  }, [key, cad, onPreview]);
  const move = (i: number, offset: number) => {
    const next = [...ids];
    [next[i], next[i + offset]] = [next[i + offset], next[i]];
    onIds(next);
  };
  return (
    <section className="through-shapes-panel surface-levels-panel" aria-label="Pinnan korkeudet">
      <div className="loft-content">
        <div className="selection-heading">
          <h2>Pinnan korkeudet</h2>
          <button onClick={onClose} aria-label="Sulje korkeustyökalu">
            ×
          </button>
        </div>
        <p className="muted">
          {saved
            ? 'Säädä rajauksien korkeuksia. Liittyvät pinnat seuraavat mukana.'
            : 'Valitse suljetut tasomuodot ulkoa sisään. Anna kullekin rajaukselle korkeus.'}
        </p>
        <ol className="level-boundaries">
          {rows.map((row, i) => (
            <li key={row.id}>
              <label>
                <span>
                  {i + 1}. {row.name}
                </span>
                <span className="level-value">
                  <input
                    aria-label={`Rajaus ${i + 1} korkeus`}
                    inputMode="decimal"
                    value={values[row.id] ?? String(-i * 10)}
                    onChange={(e) => setValues((old) => ({ ...old, [row.id]: e.target.value }))}
                  />{' '}
                  mm
                </span>
              </label>
              {!saved && (
                <div className="loft-row-actions">
                  <button
                    aria-label={`Siirrä rajaus ${i + 1} ulommaksi`}
                    disabled={!i || busy}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Siirrä rajaus ${i + 1} sisemmäksi`}
                    disabled={i === rows.length - 1 || busy}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`Poista rajaus ${i + 1}`}
                    onClick={() => onIds(ids.filter((id) => id !== row.id))}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {!saved && (
          <label className="modeling-field">
            Lisää rajaus
            <select
              aria-label="Lisää korkeusrajaus"
              value=""
              onChange={(e) => e.target.value && onIds([...ids, e.target.value])}
            >
              <option value="">Valitse tasomuoto…</option>
              {bodies
                .filter((b) => !featureIsSolid(b.feature) && !ids.includes(b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <p className="muted">Korkeudet ovat suhteessa ensimmäisen rajauksen piirtotasoon.</p>
        <label className="checkbox-label">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          Jätä sisin rajaus aukoksi
        </label>
        <label className="modeling-field">
          Pohjan syvyys · mm
          <input
            aria-label="Pohjan syvyys"
            inputMode="decimal"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
          <small>0 = pelkkä pinta. Syvyys mitataan piirtotasosta alaspäin.</small>
        </label>
        {result && (
          <div className="level-slopes" aria-label="Pinnan kaltevuudet">
            {result.bands.map((b, i) => (
              <p key={i}>
                Rajaus {i + 1} → {i + 2}:{' '}
                <strong>
                  {formatLength(b.min)}–{formatLength(b.max)} %
                </strong>
                {Math.abs(b.rise) < 1e-8
                  ? ' · tasainen'
                  : b.rise > 0
                    ? ' · nousee sisäänpäin'
                    : ' · laskee sisäänpäin'}
              </p>
            ))}
          </div>
        )}
        <details className="tool-advanced">
          <summary>Nimi ja lähtömuodot</summary>
          <label className="modeling-field">
            Nimi
            <input
              aria-label="Korkeuspinnan nimi"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {!saved && (
            <label className="checkbox-label">
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
              Piilota lähtömuodot hyväksyessä
            </label>
          )}
          <p className="muted">
            Korkeuksia voi muuttaa valmiin osan tiedoista. Muut geometriatyöstöt viimeistelevät
            pinnan tavalliseksi osaksi.
          </p>
        </details>
      </div>
      <footer className="loft-footer">
        <p role="status">
          {error ||
            (!valid
              ? 'Anna korkeudet ja pohjan syvyys numeroina.'
              : rows.length < 2
                ? 'Valitse vähintään kaksi sisäkkäistä rajausta.'
                : result
                  ? 'Pinta valmis hyväksyttäväksi.'
                  : 'Lasketaan pintaa…')}
        </p>
        <div className="loft-footer-actions">
          <button
            className="button dark full"
            disabled={!result || busy}
            onClick={() =>
              result &&
              void onCommit(
                { ...result, body: { ...result.body, name: name.trim() || 'Korkeuspinta' } },
                ids,
                hide,
              )
            }
          >
            {existing ? 'Päivitä pinta' : 'Luo pinta'}
          </button>
          <button className="button subtle full" onClick={onClose}>
            Peru · Esc
          </button>
        </div>
      </footer>
    </section>
  );
}
