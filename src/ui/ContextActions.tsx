import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Move3D,
  Copy,
  EyeOff,
  Eye,
  LockKeyhole,
  Link2,
  Pencil,
  Folder,
  Download,
  Trash2,
  MousePointer2,
  SlidersHorizontal,
} from 'lucide-react';
export type QuickAction = {
  label: string;
  run: () => void;
  disabled?: boolean;
  reason?: string;
  children?: QuickAction[];
};
export function organizeActions(actions: QuickAction[]): QuickAction[] {
  if (!actions.some((a) => a.label === 'Siirrä · M')) return actions;
  const main: QuickAction[] = [],
    edit: QuickAction[] = [],
    arrange: QuickAction[] = [],
    files: QuickAction[] = [],
    end: QuickAction[] = [];
  for (const action of actions) {
    if (action.label === 'Näkyvyys') {
      const [hide, ...rest] = action.children ?? [];
      if (hide) main.push(hide);
      main.push({ ...action, children: rest });
    } else if (/^(Siirrä ·|Kopioi ja|Kiinnitä|Linkitetty|Uniikki)/.test(action.label))
      main.push(action);
    else if (/^(Nimeä|Siirrä ryhmään|Luo kokoonpano|Poista ryhmä)/.test(action.label))
      arrange.push(action);
    else if (/^(Tallenna|Vie 3D)/.test(action.label)) files.push(action);
    else if (/^(Poista valinta|Poista pinta|Valitse toinen)/.test(action.label)) end.push(action);
    else edit.push(action);
  }
  const menu = (label: string, children: QuickAction[]): QuickAction[] =>
    children.length ? [{ label, children, run: () => {} }] : [];
  return [
    ...main,
    ...menu('Muokkaa', edit),
    ...menu('Järjestä', arrange),
    ...menu('Tallenna ja vie', files),
    ...end,
  ];
}
function actionIcon(label: string) {
  const Icon = /^Siirrä ·/.test(label)
    ? Move3D
    : /^Kopioi/.test(label)
      ? Copy
      : /^Piilota/.test(label)
        ? EyeOff
        : /^(Näkyvyys|Näytä|Eristä)/.test(label)
          ? Eye
          : /^Kiinnitä/.test(label)
            ? LockKeyhole
            : /^(Linkitetty|Uniikki)/.test(label)
              ? Link2
              : /^(Nimeä|Muokkaa)/.test(label)
                ? Pencil
                : /^(Järjestä|Siirrä ryhmään|Luo kokoonpano)/.test(label)
                  ? Folder
                  : /^(Tallenna|Vie)/.test(label)
                    ? Download
                    : /^Poista/.test(label)
                      ? Trash2
                      : /^Valitse/.test(label)
                        ? MousePointer2
                        : SlidersHorizontal;
  return <Icon size={15} aria-hidden="true" />;
}
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
  const [submenu, setSubmenu] = useState<QuickAction>();
  const items = submenu?.children ?? actions;
  useEffect(() => {
    const menu = host.current!,
      previous = document.activeElement as HTMLElement;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const down = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'ArrowLeft' && submenu)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (submenu) setSubmenu(undefined);
        else onClose();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),
          at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : (at +
                  (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)
                    ? 1
                    : items.length - 1)) %
                items.length
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
  }, [x, y, onClose, submenu]);
  return (
    <div
      ref={host}
      className="context-actions"
      role="menu"
      aria-label="Valinnan toiminnot"
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 240)), top: y }}
    >
      {submenu && (
        <button role="menuitem" onClick={() => setSubmenu(undefined)}>
          <ArrowLeft size={15} /> Takaisin
        </button>
      )}
      <strong>{submenu?.label ?? title}</strong>
      {items.map((a) => (
        <button
          role="menuitem"
          key={a.label}
          aria-label={a.label}
          data-danger={/^Poista/.test(a.label)}
          disabled={a.disabled || !!a.reason}
          title={a.reason}
          aria-haspopup={a.children ? 'menu' : undefined}
          onClick={() => {
            if (a.children) {
              setSubmenu(a);
              return;
            }
            onClose();
            a.run();
          }}
        >
          {actionIcon(a.label)}
          <span className="context-action-label">
            {a.label.replace(/ · (?:Shift\+|Alt\+)?[A-Z]$/, '')}
          </span>
          {/ · (?:Shift\+|Alt\+)?[A-Z]$/.test(a.label) && <kbd>{a.label.split(' · ').at(-1)}</kbd>}
          {a.children && <ChevronRight size={14} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
