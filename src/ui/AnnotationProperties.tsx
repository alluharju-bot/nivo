import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { formatLength } from '../model/units';
import type { AnnotationPatch } from '../model/annotationStyle';

export function AnnotationProperties({
  annotation,
  value,
  busy,
  onChange,
  onDelete,
  focusKey = 0,
  rotatable = false,
}: {
  annotation: { id: string } & AnnotationPatch;
  value: number | null;
  busy: boolean;
  onChange: (patch: AnnotationPatch) => void;
  onDelete: () => void;
  focusKey?: number;
  rotatable?: boolean;
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
      {rotatable && (
        <label>
          Mittatekstin kierto (°)
          <input
            key={`${annotation.id}:${annotation.labelRotation ?? 0}`}
            type="number"
            aria-label="Mittatekstin kierto"
            min={-360}
            max={360}
            step="any"
            defaultValue={annotation.labelRotation ?? 0}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.value = String(annotation.labelRotation ?? 0);
                e.currentTarget.blur();
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              const labelRotation = Number(e.target.value);
              if (!Number.isFinite(labelRotation) || Math.abs(labelRotation) > 360) {
                e.target.value = String(annotation.labelRotation ?? 0);
                return;
              }
              if (labelRotation !== (annotation.labelRotation ?? 0)) onChange({ labelRotation });
            }}
          />
          <span className="muted">0° pitää tekstin vaakasuorassa myös näkymää käännettäessä.</span>
        </label>
      )}
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
