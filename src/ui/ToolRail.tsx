import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Shapes,
  Square,
  Circle,
  Pentagon,
  CircleDashed,
  ChevronRight,
  PanelsTopLeft,
} from 'lucide-react';
import type { Tool } from '../viewport/Viewport';

export type ToolItem = { id: Tool; label: string; icon: ReactNode; shortcut: string };
export function ToolRail({
  tools,
  tool,
  busy,
  onTool,
  onShape,
  onCabinet,
}: {
  tools: ToolItem[];
  tool: Tool;
  busy: boolean;
  onTool: (tool: Tool) => void;
  onShape: (shape: 'rectangle' | 'circle' | 'ellipse' | 'polygon') => void;
  onCabinet: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        trigger.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []);
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        buttons[(at + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  useEffect(() => setOpen(false), [tool]);
  return (
    <>
      <aside className="tool-rail" aria-label="Mallinnustyökalut">
        {tools
          .filter((t) => !['rectangle', 'circle'].includes(t.id))
          .map((t) => (
            <div className="rail-item" key={t.id}>
              <button
                className={`tool-button ${tool === t.id ? 'active' : ''}`}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onTool(t.id);
                }}
                title={`${t.label} (${t.shortcut})`}
              >
                {t.icon}
                <span>{t.label}</span>
                <kbd>{t.shortcut}</kbd>
              </button>
              {t.id === 'pen' && (
                <button
                  ref={trigger}
                  className={`tool-button ${['rectangle', 'circle'].includes(tool) ? 'active' : ''}`}
                  aria-label="Muodot"
                  aria-pressed={['rectangle', 'circle'].includes(tool)}
                  aria-expanded={open}
                  aria-controls="shape-menu"
                  disabled={busy}
                  onClick={() => setOpen(!open)}
                  title="Muodot · S suorakulmio, C ympyrä"
                >
                  <Shapes />
                  <span>Muodot</span>
                  <ChevronRight className="shape-chevron" />
                </button>
              )}
            </div>
          ))}
      </aside>
      {open && (
        <div
          ref={menu}
          id="shape-menu"
          className="shape-menu"
          role="group"
          aria-label="Valitse muoto"
        >
          <strong>Piirrä muoto</strong>
          {(
            [
              ['rectangle', 'Suorakulmio', <Square />, 'S'],
              ['circle', 'Ympyrä', <Circle />, 'C'],
              ['ellipse', 'Ellipsi', <CircleDashed />, ''],
              ['polygon', 'Monikulmio', <Pentagon />, ''],
            ] as const
          ).map(([id, label, icon, shortcut]) => (
            <button
              key={id}
              aria-label={label}
              onClick={() => {
                setOpen(false);
                onShape(id);
              }}
            >
              {icon}
              <span>{label}</span>
              <kbd>{shortcut}</kbd>
            </button>
          ))}
          <hr />
          <button
            onClick={() => {
              setOpen(false);
              onCabinet();
            }}
          >
            <PanelsTopLeft />
            <span>Levyrunko</span>
          </button>
        </div>
      )}
    </>
  );
}
