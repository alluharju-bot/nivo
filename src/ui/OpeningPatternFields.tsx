import { useState } from 'react';
import type { OpeningPattern } from '../model/openingPattern';

export function OpeningPatternFields({
  value,
  onChange,
  busy,
}: {
  value: OpeningPattern;
  onChange: (value: OpeningPattern) => void;
  busy: boolean;
}) {
  const [fields, setFields] = useState({
    count: String(value.count),
    spacing: String(value.spacing),
    depth: String(value.depth ?? 3),
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
        onChange={(e) => {
          setFields({ ...fields, [key]: e.target.value });
          onChange({ ...value, [key]: number(e.target.value) });
        }}
      />
    </label>
  );
  return (
    <section aria-label="Aukkosarja" className="opening-pattern-fields">
      {field('count', value.first ? 'Lisäaukkoja' : 'Aukkoja yhteensä')}
      {(value.count !== 1 || !!value.first) && (
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
      <label className="modeling-field">
        Leikkauksen syvyys
        <select
          aria-label="Leikkauksen syvyys"
          value={value.depth === undefined ? 'through' : 'depth'}
          disabled={busy}
          onChange={(e) =>
            onChange({
              ...value,
              depth: e.target.value === 'through' ? undefined : number(fields.depth),
            })
          }
        >
          <option value="through">Kaikkien valittujen osien läpi</option>
          <option value="depth">Annettu syvyys pinnasta sisään</option>
        </select>
      </label>
      {value.depth !== undefined && field('depth', 'Leikkaussyvyys · mm')}
    </section>
  );
}
