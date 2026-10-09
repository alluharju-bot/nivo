import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { formatLength } from '../model/units';

export function AnnotationProperties({
  annotation,
  value,
  busy,
  onChange,
  onDelete,
  focusKey = 0,
}: {
  annotation: { id: string; label?: string; hidden?: boolean };
  value: number | null;
  busy: boolean;
  onChange: (patch: { label?: string; hidden?: boolean }) => void;
  onDelete: () => void;
  focusKey?: number;
}) {
  const [text, setText] = useState(annotation.label ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(annotation.label ?? ''), [annotation.id, annotation.label]);
  useEffect(() => {
    if (focusKey) {
      input.current?.focus();
      input.current?.select();
    }
  }, [focusKey]);
  const commit = () => {
    const label = text.trim() || undefined;
    if (label !== (annotation.label || undefined)) onChange({ label });
  };
  return (
    <section className="annotation-properties" aria-label="Merkinnän asetukset">
      <label>
        Merkinnän teksti
        <input
          ref={input}
          aria-label="Merkinnän teksti"
          value={text}
          maxLength={160}
          disabled={busy}
          placeholder="Automaattinen mitta"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setText(annotation.label ?? '');
            }
          }}
        />
      </label>
      <p className="muted">
        {'{mitta}'} näyttää päivittyvän mittaluvun. Tyhjä kenttä palauttaa automaattisen tekstin.
      </p>
      <small>
        Todellinen mitta: {value === null ? 'Viite puuttuu' : `${formatLength(value)} mm`}. Teksti
        ei muuta geometriaa.
      </small>
      <div className="annotation-buttons">
        <button
          disabled={busy}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onChange({ label: text.trim() || undefined, hidden: !annotation.hidden })}
        >
          {annotation.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
          {annotation.hidden ? 'Näytä merkintä' : 'Piilota merkintä'}
        </button>
        <button disabled={busy} onPointerDown={(e) => e.preventDefault()} onClick={onDelete}>
          <Trash2 size={15} /> Poista merkintä
        </button>
      </div>
    </section>
  );
}
