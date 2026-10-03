import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Shapes,
  Square,
  Circle,
  Pentagon,
  CircleDashed,
  ChevronRight,
  PanelsTopLeft,
  Grip,
} from 'lucide-react';
import type { Tool } from '../viewport/Viewport';

export type ToolItem = { id: Tool; label: string; icon: ReactNode; shortcut: string };
export type ToolDock = 'left' | 'right' | 'top' | 'bottom';
export function ToolRail({
  tools,
  tool,
  busy,
  onTool,
  onShape,
  onCabinet,
  dock,
  onDock,
}: {
  tools: ToolItem[];
  tool: Tool;
  busy: boolean;
  onTool: (tool: Tool) => void;
  onShape: (shape: 'rectangle' | 'circle' | 'ellipse' | 'polygon') => void;
  onCabinet: () => void;
  dock: ToolDock;
  onDock: (dock: ToolDock) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dockMenu, setDockMenu] = useState(false);
  const [drop, setDrop] = useState<ToolDock>();
  const drag = useRef<{ x: number; y: number }>(undefined);
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
  useEffect(() => {
    if (!dockMenu) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.dock-picker, .tool-grip')) setDockMenu(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDockMenu(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
    };
  }, [dockMenu]);
  useEffect(() => setOpen(false), [tool]);
  return (
    <>
      <aside className="tool-rail" aria-label="Mallinnustyökalut">
        <button
          className="tool-grip"
          aria-label="Siirrä työkalupalkkia"
          title="Vedä reunaan tai valitse sijainti"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (
              !drag.current ||
              Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 10
            )
              return;
            const r = e.currentTarget.closest('.workspace')!.getBoundingClientRect();
            const distances = {
              left: Math.abs(e.clientX - r.left),
              right: Math.abs(e.clientX - r.right),
              top: Math.abs(e.clientY - r.top),
              bottom: Math.abs(e.clientY - r.bottom),
            };
            setDrop(Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0] as ToolDock);
          }}
          onPointerUp={() => {
            if (!drag.current) return;
            if (drop) {
              onDock(drop);
              setDockMenu(false);
            } else setDockMenu(!dockMenu);
            drag.current = undefined;
            setDrop(undefined);
          }}
          onPointerCancel={() => {
            drag.current = undefined;
            setDrop(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDockMenu(!dockMenu);
            }
          }}
        >
          <Grip size={17} />
        </button>
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
      {drop && (
        <div className="dock-drop" data-side={drop}>
          Kiinnitä {{ left: 'vasemmalle', right: 'oikealle', top: 'ylös', bottom: 'alas' }[drop]}
        </div>
      )}
      {dockMenu && (
        <div className="dock-picker" role="group" aria-label="Työkalupalkin sijainti">
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
            <button
              key={side}
              aria-pressed={side === dock}
              onClick={() => {
                onDock(side);
                setDockMenu(false);
              }}
            >
              {{ left: 'Vasen', right: 'Oikea', top: 'Ylä', bottom: 'Ala' }[side]}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div
          ref={menu}
          id="shape-menu"
          className="shape-menu"
          style={
            trigger.current
              ? {
                  position: 'fixed',
                  left: Math.min(
                    window.innerWidth - 220,
                    Math.max(
                      8,
                      trigger.current.getBoundingClientRect().left +
                        (dock === 'left' ? 70 : dock === 'right' ? -220 : 0),
                    ),
                  ),
                  top: Math.min(
                    window.innerHeight - 310,
                    Math.max(
                      8,
                      trigger.current.getBoundingClientRect().top +
                        (dock === 'top' ? 64 : dock === 'bottom' ? -300 : 0),
                    ),
                  ),
                }
              : undefined
          }
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
