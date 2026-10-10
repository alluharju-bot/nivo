import { useState } from 'react';
import { parseLength } from '../model/units';
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
          onChange({ ...value, [key]: parsed });
        }}
      />
    </label>
  );
  return (
    <section aria-label="Aukkosarja" className="opening-pattern-fields">
      {field('depth', 'Leikkaussyvyys · mm')}
      <p className="muted">Tyhjä = läpi. Syvyys mitataan piirretyn muodon tasosta sisään.</p>
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
    </section>
  );
}
