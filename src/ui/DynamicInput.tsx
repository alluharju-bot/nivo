import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Check, X, LockKeyhole, GripHorizontal, PanelRightClose } from 'lucide-react';
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
  showActions = true,
  canAccept = true,
  position,
  onPositionChange,
  docked,
  locked,
  onChange,
  onAccept,
  onCancel,
  busy,
  title,
  activeKey,
  onActivate,
  initialValue,
}: {
  fields: NumericField[];
  showActions?: boolean;
  canAccept?: boolean;
  position?: [number, number];
  onPositionChange: (point?: [number, number]) => void;
  docked: boolean;
  locked: Set<string>;
  onChange: (key: string, value: string) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
  title: string;
  activeKey?: string;
  onActivate?: (key: string, transfer: boolean) => void;
  initialValue?: (key: string, character: string) => string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | undefined>(undefined);
  const clamp = (x: number, y: number): [number, number] => {
    const rect = panel.current?.getBoundingClientRect();
    return [
      Math.max(8, Math.min(x, window.innerWidth - (rect?.width ?? 236) - 8)),
      Math.max(8, Math.min(y, window.innerHeight - (rect?.height ?? 140) - 8)),
    ];
  };
  useEffect(() => {
    if (!position) return;
    const adjust = () => {
      const next = clamp(...position);
      if (next[0] !== position[0] || next[1] !== position[1]) onPositionChange(next);
    };
    const observer = new ResizeObserver(adjust);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', adjust);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', adjust);
    };
  }, [position, onPositionChange]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || busy || event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable],[role=dialog],[role=menu]',
        )
      )
        return;
      if (/^[\d.,+\-]$/.test(event.key)) {
        event.preventDefault();
        const index = Math.max(
          0,
          fields.findIndex((f) => f.key === activeKey),
        );
        const key = fields[index].key;
        flushSync(() => onChange(key, initialValue?.(key, event.key) ?? event.key));
        const input = inputs.current[index];
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const index = Math.max(
          0,
          fields.findIndex((f) => f.key === activeKey),
        );
        inputs.current[index]?.focus();
        inputs.current[index]?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fields, onChange, busy, activeKey, initialValue]);
  return (
    <div
      ref={panel}
      className={`dynamic-input ${position ? 'floating' : docked ? 'docked' : 'undocked'}`}
      data-testid="dynamic-input"
      style={position ? { left: position[0], top: position[1] } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="dynamic-title">
        <button
          type="button"
          className="dynamic-drag"
          aria-label="Siirrä mittaikkunaa"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const rect = panel.current!.getBoundingClientRect();
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            onPositionChange(clamp(rect.left, rect.top));
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (active?.pointer === event.pointerId)
              onPositionChange(clamp(event.clientX - active.x, event.clientY - active.y));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer === event.pointerId) {
              drag.current = undefined;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
        >
          <GripHorizontal size={14} />
          <span>{title}</span>
        </button>
        {position ? (
          <button
            type="button"
            className="dynamic-redock"
            aria-label="Palauta mittaikkuna oikeaan reunaan"
            onClick={() => onPositionChange(undefined)}
          >
            <PanelRightClose size={16} />
          </button>
        ) : (
          <small>Tab →</small>
        )}
      </div>
      <div className="dynamic-fields">
        {fields.map((field, i) => (
          <label
            key={field.key}
            className={`${locked.has(field.key) ? 'locked' : ''} ${activeKey === field.key ? 'active-input' : ''}`}
          >
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
              onFocus={(e) => {
                onActivate?.(field.key, false);
                e.target.select();
              }}
              onChange={(e) => onChange(field.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const next = (i + (e.shiftKey ? -1 : 1) + fields.length) % fields.length;
                  flushSync(() => onActivate?.(fields[next].key, true));
                  inputs.current[next]?.focus();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canAccept) onAccept();
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
      {showActions && (
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
          <button
            className="dynamic-accept"
            aria-label="Hyväksy"
            onClick={onAccept}
            disabled={busy || !canAccept}
          >
            <Check size={15} />
            <span>Enter</span>
          </button>
        </div>
      )}
      <p className="numeric-hint">Numero aloittaa · Tab vaihtaa kenttää · Esc peruu</p>
    </div>
  );
}
