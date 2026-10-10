import { useState } from 'react';
import { parseLength } from '../model/units';
import type { Vec3 } from '../model/project';
import type { OpeningPattern } from '../model/openingPattern';

export function OpeningPatternFields({
  value,
  onChange,
  busy,
  center,
}: {
  value: OpeningPattern;
  onChange: (value: OpeningPattern) => void;
  busy: boolean;
  center: Vec3;
}) {
  const [fields, setFields] = useState({
    count: String(value.count),
    spacing: String(value.spacing),
    angle: String(value.radial?.angle ?? 45),
    depth: value.depth === undefined ? '' : String(value.depth),
  });
  const number = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : NaN);
  const field = (key: keyof typeof fields, label: string) => (
    <label className="modeling-field">
      {label}
      <input
        aria-label={label}
        inputMode="decimal"
        value={fields[key]}
        disabled={busy}
        placeholder={key === 'depth' ? 'Läpi' : undefined}
        onChange={(e) => {
          setFields({ ...fields, [key]: e.target.value });
          let parsed: number | undefined = number(e.target.value);
          if (key === 'depth') {
            try {
              parsed = e.target.value.trim() ? parseLength(e.target.value) : undefined;
            } catch {
              parsed = NaN;
            }
          }
          onChange(
            key === 'angle' && value.radial
              ? { ...value, radial: { ...value.radial, angle: parsed!, fullCircle: false } }
              : { ...value, [key]: parsed },
          );
        }}
      />
    </label>
  );
  return (
    <section aria-label="Aukkosarja" className="opening-pattern-fields">
      {field('depth', 'Leikkaussyvyys · mm')}
      <p className="muted">Tyhjä = läpi. Syvyys mitataan piirretyn muodon tasosta sisään.</p>
      <label className="modeling-field">
        Toisto
        <select
          aria-label="Aukkojen toisto"
          disabled={busy}
          value={value.radial ? 'radial' : 'line'}
          onChange={(e) => {
            const count =
              Number.isInteger(value.count) && value.count > 1 && value.count <= 100
                ? value.count
                : 8;
            if (e.target.value === 'radial') {
              setFields({ ...fields, count: String(count), angle: String(360 / count) });
              onChange({
                ...value,
                count,
                spacing: Number.isFinite(value.spacing) ? value.spacing : 10,
                first: 0,
                radial: { pivot: center, axis: 'z', angle: 360 / count, fullCircle: true },
              });
            } else onChange({ ...value, radial: undefined });
          }}
        >
          <option value="line">Suora</option>
          <option value="radial">Ympyrä</option>
        </select>
      </label>
      {field('count', value.first ? 'Lisäaukkoja' : 'Aukkoja yhteensä')}
      {value.radial && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!value.radial.fullCircle}
              disabled={busy}
              onChange={(e) => {
                const angle =
                  360 /
                  (Number.isInteger(value.count) && value.count > 0
                    ? value.count + value.first
                    : 8);
                setFields({ ...fields, angle: String(angle) });
                onChange({
                  ...value,
                  radial: { ...value.radial!, angle, fullCircle: e.target.checked },
                });
              }}
            />
            Tasavälein koko ympyrälle
          </label>
          {!value.radial.fullCircle && field('angle', 'Kulmaväli · °')}
          <label className="modeling-field">
            Kiertoakseli
            <select
              aria-label="Aukkosarjan kiertoakseli"
              value={value.radial.axis}
              disabled={busy}
              onChange={(e) =>
                onChange({
                  ...value,
                  radial: { ...value.radial!, axis: e.target.value as 'x' | 'y' | 'z' },
                })
              }
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <details className="tool-advanced">
            <summary>Kiertopiste</summary>
            <button
              className="button outlined"
              disabled={busy}
              onClick={() => onChange({ ...value, radial: { ...value.radial!, pivot: center } })}
            >
              Kohteiden keskipiste
            </button>
            {value.radial.pivot.map((coordinate, i) => (
              <label className="modeling-field" key={i}>
                {'XYZ'[i]}
                <input
                  aria-label={`Aukkosarjan kiertopiste ${'XYZ'[i]}`}
                  inputMode="decimal"
                  key={coordinate}
                  defaultValue={Number(coordinate.toFixed(3))}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    let n: number;
                    try {
                      n = parseLength(e.target.value, true, true);
                    } catch {
                      n = NaN;
                    }
                    if (!Number.isFinite(n)) {
                      e.target.value = String(coordinate);
                      return;
                    }
                    const pivot = [...value.radial!.pivot] as Vec3;
                    pivot[i] = n;
                    onChange({ ...value, radial: { ...value.radial!, pivot } });
                  }}
                />
              </label>
            ))}
          </details>
          <p className="muted">
            Muoto ja leikkaussuunta kiertyvät yhdessä. Rajaa syvyys, jos vastapuoli pitää säilyttää.
          </p>
        </>
      )}

      {!value.radial && (value.count !== 1 || !!value.first) && (
        <>
          {field('spacing', 'Aukkojen väli · mm')}
          <label className="modeling-field">
            Suunta
            <select
              aria-label="Aukkosarjan suunta"
              value={value.direction}
              disabled={busy}
              onChange={(e) =>
                onChange({ ...value, direction: e.target.value as OpeningPattern['direction'] })
              }
            >
              <option value="u">Pinnan vaakasuunta</option>
              <option value="v">Pinnan pystysuunta</option>
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <p className="muted">Keskipisteestä keskipisteeseen. Miinusmerkki vaihtaa suunnan.</p>
        </>
      )}
    </section>
  );
}
