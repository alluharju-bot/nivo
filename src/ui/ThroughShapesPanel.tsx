import { useEffect, useRef, useState } from 'react';
import type { Body } from '../model/project';
import { featureIsSolid } from '../model/project';
import type { CadClient } from '../cad/client';
import type { EdgeDetailResult } from '../cad/protocol';
import type { ThroughShapesOptions } from '../cad/throughShapes';

export function ThroughShapesPanel({
  bodies,
  ids,
  onIds,
  cad,
  busy,
  onPreview,
  onCommit,
  onClose,
  onHelp,
}: {
  bodies: Body[];
  ids: string[];
  onIds: (ids: string[]) => void;
  cad: CadClient;
  busy: boolean;
  onPreview: (result?: EdgeDetailResult) => void;
  onCommit: (result: EdgeDetailResult, ids: string[], hide: boolean) => Promise<void>;
  onClose: () => void;
  onHelp: () => void;
}) {
  const [options, setOptions] = useState<ThroughShapesOptions>({
    mode: 'sections',
    smooth: true,
    closeSides: false,
    solid: false,
    reverseIds: [],
    name: 'Muotojen läpi',
  });
  const [hide, setHide] = useState(true);
  const [state, setState] = useState<{ key: string; result?: EdgeDetailResult; error?: string }>({
    key: '',
  });
  const generation = useRef(0);
  const profiles = ids.map((id) => bodies.find((b) => b.id === id)).filter((b): b is Body => !!b);
  const key = JSON.stringify([profiles, options]);
  const result = state.key === key ? state.result : undefined;
  const error = state.key === key ? state.error : undefined;
  const minimum = options.mode === 'sections' && options.tipHeight !== undefined ? 1 : 2;
  const change = (patch: Partial<ThroughShapesOptions>) => setOptions((o) => ({ ...o, ...patch }));
  useEffect(() => {
    const request = ++generation.current;
    onPreview(undefined);
    if (profiles.length < minimum) return;
    const timer = setTimeout(() => {
      void cad
        .throughShapes(profiles, options)
        .then((result) => {
          if (generation.current !== request) return;
          setState({ key, result });
          onPreview(result);
        })
        .catch((e: Error) => {
          if (generation.current === request) setState({ key, error: e.message });
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      generation.current++;
      onPreview(undefined);
    };
  }, [key, cad, onPreview]);
  const move = (at: number, offset: number) => {
    const next = [...ids];
    [next[at], next[at + offset]] = [next[at + offset], next[at]];
    onIds(next);
  };
  return (
    <section className="through-shapes-panel" aria-label="Muotojen läpi">
      <div className="loft-content">
        <div className="selection-heading">
          <h2>Muotojen läpi</h2>
          <button onClick={onClose} aria-label="Sulje pintatyökalu">
            ×
          </button>
        </div>
        <p className="muted">Valitse profiilit järjestyksessä näkymästä tai listasta.</p>
        <button
          className="tool-example"
          onClick={onHelp}
          aria-label="Näytä esimerkki: Muotojen läpi"
        >
          Näytä esimerkki
        </button>
        <label className="modeling-field">
          Rakennustapa
          <select
            aria-label="Pinnan rakennustapa"
            value={options.mode}
            onChange={(e) =>
              change({
                mode: e.target.value as ThroughShapesOptions['mode'],
                solid: false,
                tipHeight: undefined,
              })
            }
          >
            <option value="sections">Poikkileikkaukset</option>
            <option value="sides">Sivukäyrät</option>
          </select>
        </label>

        <ol className="loft-profiles">
          {profiles.map((body, i) => (
            <li key={body.id}>
              <span title={body.name}>
                {i + 1}. {body.name}
              </span>
              <div className="loft-row-actions">
                <button
                  aria-label={`Siirrä ${body.name} aiemmaksi`}
                  disabled={!i || busy}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Siirrä ${body.name} myöhemmäksi`}
                  disabled={i === ids.length - 1 || busy}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  aria-label={`Käännä ${body.name}`}
                  aria-pressed={options.reverseIds.includes(body.id)}
                  onClick={() =>
                    change({
                      reverseIds: options.reverseIds.includes(body.id)
                        ? options.reverseIds.filter((id) => id !== body.id)
                        : [...options.reverseIds, body.id],
                    })
                  }
                >
                  ⇄
                </button>
                <button
                  aria-label={`Poista profiili ${body.name}`}
                  onClick={() => onIds(ids.filter((id) => id !== body.id))}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
        <label className="modeling-field">
          Lisää muoto
          <select
            aria-label="Lisää profiili"
            value=""
            onChange={(e) => e.target.value && onIds([...ids, e.target.value])}
          >
            <option value="">Valitse viiva tai tasomuoto…</option>
            {bodies
              .filter((b) => !featureIsSolid(b.feature) && !ids.includes(b.id))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.smooth}
            onChange={(e) => change({ smooth: e.target.checked })}
          />
          Pehmeä siirtymä
        </label>
        {options.mode === 'sections' && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.tipHeight !== undefined}
                onChange={(e) => change({ tipHeight: e.target.checked ? 200 : undefined })}
              />
              Päätä kärkeen · kartio
            </label>
            {options.tipHeight !== undefined && (
              <label className="modeling-field">
                Kärjen etäisyys viimeisestä profiilista · mm
                <input
                  aria-label="Kärjen etäisyys"
                  type="number"
                  value={options.tipHeight}
                  onChange={(e) => change({ tipHeight: Number(e.target.value) })}
                />
              </label>
            )}
          </>
        )}
        {options.mode === 'sides' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={options.closeSides}
              onChange={(e) => change({ closeSides: e.target.checked, solid: false })}
            />
            Sulje sivut ympäri
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.solid}
            disabled={options.mode === 'sides' && !options.closeSides}
            onChange={(e) => change({ solid: e.target.checked })}
          />
          Sulje päädyt · umpiosa
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          Piilota lähtömuodot hyväksyessä
        </label>
        <details className="tool-advanced">
          <summary>Nimi ja toimintatapa</summary>
          <p className="muted">
            Lähtömuodot säilyvät mallilistassa. Valmis pinta on itsenäinen osa.
          </p>
          <label className="modeling-field">
            Nimi
            <input
              aria-label="Pinnan nimi"
              value={options.name}
              maxLength={120}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
        </details>
      </div>
      <footer className="loft-footer">
        <p role="status">
          {error ||
            (profiles.length < minimum
              ? `Valitse vähintään ${minimum === 1 ? 'yksi muoto' : 'kaksi muotoa'}.`
              : result
                ? `${options.solid ? 'Umpiosa' : 'Pinta'} valmis hyväksyttäväksi.`
                : 'Lasketaan pintaa…')}
        </p>
        <div className="loft-footer-actions">
          <button
            className="button dark full"
            disabled={!result || busy}
            onClick={() => result && void onCommit(result, ids, hide)}
          >
            Luo pinta
          </button>
          <button className="button subtle full" onClick={onClose}>
            Peru · Esc
          </button>
        </div>
      </footer>
    </section>
  );
}
