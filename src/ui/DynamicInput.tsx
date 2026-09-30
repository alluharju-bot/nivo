import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Check, X, LockKeyhole } from 'lucide-react';
export interface NumericField {
  key: string;
  label: string;
  value: string;
  unit: string;
  testId: string;
  signed?: boolean;
}
export function DynamicInput({
  fields,
  position,
  locked,
  onChange,
  onAccept,
  onCancel,
  busy,
  title,
}: {
  fields: NumericField[];
  position: [number, number];
  locked: Set<string>;
  onChange: (key: string, value: string) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
  title: string;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (busy || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (/^[\d.,+\-]$/.test(event.key)) {
        event.preventDefault();
        flushSync(() => onChange(fields[0].key, event.key));
        const input = inputs.current[0];
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        inputs.current[0]?.focus();
        inputs.current[0]?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fields, onChange, busy]);
  return (
    <div
      className="dynamic-input"
      data-testid="dynamic-input"
      style={{ left: position[0], top: position[1] }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="dynamic-title">
        <span>{title}</span>
        <small>Tab →</small>
      </div>
      <div className="dynamic-fields">
        {fields.map((field, i) => (
          <label key={field.key} className={locked.has(field.key) ? 'locked' : ''}>
            <span>
              {field.label}
              {locked.has(field.key) && <LockKeyhole size={10} />}
            </span>
            <input
              aria-label={field.label}
              data-testid={field.testId}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={field.value}
              inputMode="decimal"
              disabled={busy}
              onFocus={(e) => e.target.select()}
              onChange={(e) => onChange(field.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  inputs.current[
                    (i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length
                  ]?.focus();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  onAccept();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancel();
                }
              }}
            />
            <small>{field.unit}</small>
          </label>
        ))}
      </div>
      <div className="dynamic-footer">
        {fields
          .filter((f) => f.signed)
          .map((f) => (
            <button
              key={f.key}
              type="button"
              aria-label={`Vaihda etumerkki: ${f.label}`}
              onClick={() =>
                onChange(f.key, f.value.startsWith('-') ? f.value.slice(1) : `-${f.value}`)
              }
            >
              ± {f.label.includes('·') ? f.label.split('·').at(-1) : ''}
            </button>
          ))}
        <span className="dynamic-spacer" />
        <button aria-label="Peruuta" onClick={onCancel}>
          <X size={15} />
        </button>
        <button className="dynamic-accept" aria-label="Hyväksy" onClick={onAccept} disabled={busy}>
          <Check size={15} />
          <span>Enter</span>
        </button>
      </div>
    </div>
  );
}
