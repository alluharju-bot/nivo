import { useEffect, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import type { Markup } from '../model/project';
import { areaText, areaUnion } from '../model/markups';
export function MarkupProperties({
  markup,
  busy,
  onChange,
  onDelete,
}: {
  markup: Markup;
  busy: boolean;
  onChange: (markup: Markup) => void;
  onDelete: () => void;
}) {
  const value = markup.kind === 'area' ? markup.name : markup.text;
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [markup.id, value]);
  const withText = () =>
    ({
      ...markup,
      ...(markup.kind === 'area' ? { name: text.trim() || value } : { text: text.trim() || value }),
    }) as Markup;
  const commit = () => {
    if (text.trim() && text.trim() !== value) onChange(withText());
    else if (!text.trim()) setText(value);
  };
  return (
    <section
      className="markup-properties"
      aria-label={markup.kind === 'area' ? 'Pinta-alueen asetukset' : 'Huomautuksen asetukset'}
    >
      <h2>{markup.kind === 'area' ? 'Pinta-alue' : 'Huomautus'}</h2>
      <label>
        {markup.kind === 'area' ? 'Alueen nimi' : 'Huomautuksen teksti'}
        <textarea
          aria-label={markup.kind === 'area' ? 'Alueen nimi' : 'Huomautuksen teksti'}
          rows={markup.kind === 'area' ? 1 : 4}
          maxLength={markup.kind === 'area' ? 120 : 600}
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setText(value);
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              commit();
            }
          }}
        />
      </label>
      {markup.kind === 'area' ? (
        <strong className="area-total">{areaText(areaUnion(markup.rectangles).area)}</strong>
      ) : (
        <p className="muted">Vedä tekstilaatikkoa näkymässä. Shift + Enter lisää tekstirivin.</p>
      )}
      <label>
        {markup.kind === 'area' ? 'Alueen väri' : 'Laatikon väri'}
        <input
          aria-label={markup.kind === 'area' ? 'Alueen väri' : 'Laatikon väri'}
          type="color"
          value={markup.color}
          disabled={busy}
          onChange={(e) => onChange({ ...withText(), color: e.target.value })}
        />
      </label>
      {markup.kind === 'note' && (
        <details>
          <summary>Tekstin ja kehyksen tyyli</summary>
          <label>
            Kehys
            <select
              aria-label="Tekstilaatikon muoto"
              value={markup.shape}
              disabled={busy}
              onChange={(e) =>
                onChange({ ...markup, shape: e.target.value as typeof markup.shape })
              }
            >
              <option value="rounded">Pyöristetty</option>
              <option value="square">Suorakulmio</option>
              <option value="plain">Pelkkä teksti</option>
            </select>
          </label>
          <label>
            Tekstin koko
            <select
              aria-label="Huomautuksen tekstikoko"
              value={markup.fontSize}
              disabled={busy}
              onChange={(e) => onChange({ ...markup, fontSize: Number(e.target.value) })}
            >
              {[10, 12, 14, 16, 20, 24, 28].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tekstin väri
            <input
              aria-label="Huomautuksen tekstiväri"
              type="color"
              value={markup.textColor}
              disabled={busy}
              onChange={(e) => onChange({ ...markup, textColor: e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={markup.bold}
              disabled={busy}
              onChange={(e) => onChange({ ...markup, bold: e.target.checked })}
            />
            Lihavoitu
          </label>
        </details>
      )}
      <div className="annotation-buttons">
        <button
          disabled={busy}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onChange({ ...withText(), hidden: !markup.hidden })}
        >
          {markup.hidden ? <Eye size={15} /> : <EyeOff size={15} />}{' '}
          {markup.hidden ? 'Näytä merkintä' : 'Piilota merkintä'}
        </button>
        <button disabled={busy} onPointerDown={(e) => e.preventDefault()} onClick={onDelete}>
          <Trash2 size={15} />
          Poista merkintä
        </button>
      </div>
    </section>
  );
}
