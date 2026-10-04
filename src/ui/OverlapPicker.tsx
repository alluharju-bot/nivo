import { useEffect, useRef, useState } from 'react';
import { X, MousePointer2 } from 'lucide-react';
import type { FaceRef } from '../model/project';
export interface PickCandidate {
  bodyId: string;
  face?: FaceRef;
}
export function OverlapPicker({
  x,
  y,
  candidates,
  onPreview,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  candidates: (PickCandidate & { name: string; description: string })[];
  onPreview: (id?: string) => void;
  onSelect: (candidate: PickCandidate) => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const touch = useRef(false);
  const [touchChoice, setTouchChoice] = useState<PickCandidate>();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const panel = host.current!;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    (
      panel.querySelector<HTMLElement>('[data-candidate]') ?? panel.querySelector('button')
    )?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [x, y]);
  return (
    <div
      className="pick-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={host}
        className="overlap-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Valitse toinen"
        style={{ left: x, top: y }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) {
            e.preventDefault();
            const buttons = [...host.current!.querySelectorAll<HTMLButtonElement>('button')];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[
              (at + (e.key === 'ArrowUp' || e.shiftKey ? buttons.length - 1 : 1)) % buttons.length
            ]?.focus();
          }
        }}
      >
        <header>
          <strong>Valitse toinen · {candidates.length}</strong>
          <button aria-label="Sulje kohdevalinta" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p>Osoita vaihtoehtoa nähdäksesi sen. Korostus näyttää myös takana olevan osan.</p>
        <div className="overlap-options">
          {candidates.map((c) => (
            <button
              key={c.bodyId}
              data-candidate={c.bodyId}
              onFocus={() => onPreview(c.bodyId)}
              onPointerEnter={() => onPreview(c.bodyId)}
              onPointerDown={(e) => {
                touch.current = e.pointerType === 'touch';
              }}
              onClick={() => {
                if (touch.current) {
                  setTouchChoice(c);
                  onPreview(c.bodyId);
                } else onSelect(c);
              }}
            >
              <MousePointer2 size={16} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.description}</small>
              </span>
            </button>
          ))}
        </div>
        {touchChoice && (
          <button className="button dark full" onClick={() => onSelect(touchChoice)}>
            Valitse korostettu
          </button>
        )}
        {!candidates.length && <p>Tässä kohdassa ei ole valittavia osia.</p>}
      </div>
    </div>
  );
}
