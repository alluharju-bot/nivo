import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const palette = [
  ['Hiekka', '#d8c8a7'],
  ['Valkoinen', '#eeeeea'],
  ['Grafiitti', '#58636a'],
  ['Vihreä', '#729582'],
  ['Sininen', '#7d9fb8'],
  ['Terrakotta', '#bc8874'],
];
export function BodyColor({
  color,
  mixed,
  busy,
  onChange,
}: {
  color: string;
  mixed: boolean;
  busy: boolean;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  return (
    <fieldset className="body-color" disabled={busy}>
      <legend>{mixed ? 'Väri · useita' : 'Väri'}</legend>
      <div className="color-palette">
        {palette.map(([name, value]) => (
          <button
            key={value}
            type="button"
            aria-label={`Väri: ${name}`}
            title={name}
            aria-pressed={!mixed && color.toLowerCase() === value}
            style={{ background: value }}
            onClick={() => onChange(value)}
          />
        ))}
      </div>
      <div className="custom-color">
        <input
          type="color"
          aria-label="Oma osaväri"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span>{draft.toUpperCase()}</span>
        <button
          type="button"
          aria-label="Käytä väriä"
          title="Käytä väriä"
          disabled={!mixed && draft.toLowerCase() === color.toLowerCase()}
          onClick={() => onChange(draft)}
        >
          <Check size={16} />
        </button>
      </div>
    </fieldset>
  );
}
