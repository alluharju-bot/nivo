import { useEffect, useRef, useState } from 'react';
import { Move, Trash2 } from 'lucide-react';
import type { GuideEndpoint } from '../model/guideEditing';

export function GuidePointMenu({
  x,
  y,
  choices,
  onPreview,
  onMove,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  choices: { target: GuideEndpoint; label: string }[];
  onPreview: (id: string) => void;
  onMove: (target: GuideEndpoint) => void;
  onRemove: (target: GuideEndpoint) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [selected, setSelected] = useState(choices[0].target);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = [...(menu.current?.querySelectorAll('button') ?? [])];
        e.preventDefault();
        const next =
          buttons.indexOf(document.activeElement as HTMLButtonElement) +
          (e.key === 'ArrowDown' ? 1 : -1);
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
    };
  }, []);
  return (
    <div
      ref={menu}
      className="shape-menu guide-point-menu"
      role="menu"
      aria-label="Mittaviivan piste"
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(x, window.innerWidth - 258)),
        top: Math.max(8, Math.min(y, window.innerHeight - (choices.length > 1 ? 350 : 156))),
      }}
    >
      <strong>Mittaviivan piste</strong>
      {choices.length > 1 && (
        <>
          <small>Valitse viiva · muut jäävät paikoilleen</small>
          <div className="guide-point-choices">
            {choices.map(({ target, label }) => (
              <button
                key={`${target.guideId}:${target.end}`}
                role="menuitemradio"
                aria-checked={selected.guideId === target.guideId && selected.end === target.end}
                onMouseEnter={() => onPreview(target.guideId)}
                onFocus={() => onPreview(target.guideId)}
                onClick={() => {
                  setSelected(target);
                  onPreview(target.guideId);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        role="menuitem"
        onFocus={() => onPreview(selected.guideId)}
        onClick={() => onMove(selected)}
      >
        <Move />
        <span>Siirrä pistettä</span>
      </button>
      <button
        role="menuitem"
        onFocus={() => onPreview(selected.guideId)}
        onClick={() => onRemove(selected)}
      >
        <Trash2 />
        <span>Poista mittaviiva</span>
      </button>
    </div>
  );
}
