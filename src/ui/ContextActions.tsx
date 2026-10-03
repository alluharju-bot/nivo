import { useEffect, useRef } from 'react';
export type QuickAction = { label: string; run: () => void; disabled?: boolean };
export function ContextActions({
  x,
  y,
  title,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  actions: QuickAction[];
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const menu = host.current!,
      previous = document.activeElement as HTMLElement;
    const rect = menu.getBoundingClientRect();
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const down = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),
          at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
        ]?.focus();
      }
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
      if (document.activeElement === document.body || menu.contains(document.activeElement))
        previous?.focus();
    };
  }, [x, y, onClose]);
  return (
    <div
      ref={host}
      className="context-actions"
      role="menu"
      aria-label="Valinnan toiminnot"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 240)), top: y }}
    >
      <strong>{title}</strong>
      {actions.map((a) => (
        <button
          role="menuitem"
          key={a.label}
          disabled={a.disabled}
          onClick={() => {
            onClose();
            a.run();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
