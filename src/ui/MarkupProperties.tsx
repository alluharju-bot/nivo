import { HighlightStyleFields } from './HighlightStyleFields';
import { useEffect, useRef, useState } from 'react';
import { MarkupColor } from './MarkupColor';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import type { Markup } from '../model/project';
import { areaText, areaUnion } from '../model/markups';
export function MarkupProperties({
  markup,
  busy,
  onChange,
  onDelete,
  onPreview,
  focusRequest,
}: {
  markup: Markup;
  busy: boolean;
  onChange: (markup: Markup) => void;
  onDelete: () => void;
  onPreview: (markup?: Markup) => void;
  focusRequest?: number;
}) {
  const textInput = useRef<HTMLTextAreaElement>(null);
  const skipBlur = useRef(false);
  const returnToModel = () => {
    skipBlur.current = true;
    document
      .querySelector<HTMLCanvasElement>('canvas[data-testid="viewport"]')
      ?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (focusRequest && markup.kind === 'note' && !busy) {
      textInput.current?.focus({ preventScroll: true });
      textInput.current?.select();
    }
  }, [focusRequest]);
  const value = markup.kind !== 'note' ? markup.name : markup.text;
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [markup.id, value]);
  const withText = () =>
    ({
      ...markup,
      ...(markup.kind !== 'note' ? { name: text.trim() || value } : { text: text.trim() || value }),
    }) as Markup;
  const commit = () => {
    if (text.trim() && text.trim() !== value) onChange(withText());
    else if (!text.trim()) setText(value);
  };
  return (
    <section
      className="markup-properties"
      aria-label={
        markup.kind === 'highlight'
          ? 'Korostusalueen asetukset'
          : markup.kind === 'area'
            ? 'Pinta-alueen asetukset'
            : 'Huomautuksen asetukset'
      }
    >
      <h2>
        {markup.kind === 'highlight'
          ? 'Korostusalue'
          : markup.kind === 'area'
            ? 'Pinta-alue'
            : 'Huomautus'}
      </h2>
      <label>
        {markup.kind !== 'note' ? 'Alueen nimi' : 'Huomautuksen teksti'}
        <textarea
          ref={textInput}
          aria-label={markup.kind !== 'note' ? 'Alueen nimi' : 'Huomautuksen teksti'}
          rows={markup.kind !== 'note' ? 1 : 4}
          maxLength={markup.kind !== 'note' ? 120 : 600}
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (skipBlur.current) skipBlur.current = false;
            else commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setText(value);
              returnToModel();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              commit();
              returnToModel();
            }
          }}
        />
      </label>
      {markup.kind === 'area' ? (
        <strong className="area-total">{areaText(areaUnion(markup.rectangles).area)}</strong>
      ) : (
        markup.kind === 'note' && (
          <p className="muted">Vedä tekstilaatikkoa näkymässä. Shift + Enter lisää tekstirivin.</p>
        )
      )}
      <label>
        {markup.kind === 'highlight'
          ? 'Reunan väri'
          : markup.kind === 'area'
            ? 'Alueen väri'
            : 'Laatikon väri'}
        <MarkupColor
          label={
            markup.kind === 'highlight'
              ? 'Reunan väri'
              : markup.kind === 'area'
                ? 'Alueen väri'
                : 'Laatikon väri'
          }
          value={markup.color}
          disabled={busy}
          onPreview={(color) => onPreview(color ? { ...withText(), color } : undefined)}
          onCommit={(color) => onChange({ ...withText(), color })}
        />
      </label>
      {markup.kind === 'highlight' && (
        <HighlightStyleFields
          value={markup}
          disabled={busy}
          onChange={(patch) => onChange({ ...withText(), ...patch } as Markup)}
        />
      )}
      {markup.kind === 'note' && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={markup.leader !== false}
              disabled={busy}
              onPointerDown={(e) => e.preventDefault()}
              onChange={(e) => onChange({ ...withText(), leader: e.target.checked } as Markup)}
            />
            Näytä kohdistusviiva
          </label>
          <label>
            Kohdistusviivan väri
            <MarkupColor
              label="Kohdistusviivan väri"
              value={markup.leaderColor ?? markup.textColor}
              disabled={busy}
              onPreview={(leaderColor) =>
                onPreview(leaderColor ? ({ ...withText(), leaderColor } as Markup) : undefined)
              }
              onCommit={(leaderColor) => onChange({ ...withText(), leaderColor } as Markup)}
            />
          </label>
          <div className="note-style-fields">
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
              <MarkupColor
                label="Huomautuksen tekstiväri"
                value={markup.textColor}
                disabled={busy}
                onPreview={(textColor) =>
                  onPreview(textColor ? { ...markup, textColor } : undefined)
                }
                onCommit={(textColor) => onChange({ ...markup, textColor })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={markup.bold}
                disabled={busy}
                onPointerDown={(e) => e.preventDefault()}
                onChange={(e) => onChange({ ...withText(), bold: e.target.checked } as Markup)}
              />
              Lihavoitu
            </label>
          </div>
        </>
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
