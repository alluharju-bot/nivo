import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ListTree, Pin, PinOff, ChevronLeft } from 'lucide-react';

export function ModelBrowser({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState(
    () => localStorage.getItem('nivo-browser-pinned') === 'true',
  );
  const [expanded, setExpanded] = useState(true);
  const host = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enter = () => {
    clearTimeout(timer.current);
    setExpanded(true);
  };
  const leave = (event: React.PointerEvent) => {
    // Touch emits pointerleave whenever the finger lifts. It is not a request to hide the list.
    if (event.pointerType !== 'mouse') return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!dragging.current && !host.current?.contains(document.activeElement)) setExpanded(false);
    }, 650);
  };
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('canvas[data-testid="viewport"], .tool-button'))
        setExpanded(false);
    };
    const up = () => {
      dragging.current = false;
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('pointerdown', down);
      clearTimeout(timer.current);
    };
  }, []);
  return (
    <>
      <aside
        ref={host}
        className="model-browser"
        aria-label="Mallilista"
        data-expanded={expanded || pinned}
        onPointerDown={() => {
          dragging.current = true;
          clearTimeout(timer.current);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => setExpanded(true)}
      >
        <div className="browser-heading">
          <span>Mallin sisältö</span>
          <button
            aria-label="Piilota mallilista"
            onClick={() => {
              setExpanded(false);
              setPinned(false);
              localStorage.setItem('nivo-browser-pinned', 'false');
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            aria-label={pinned ? 'Vapauta mallilista' : 'Pidä mallilista näkyvissä'}
            aria-pressed={pinned}
            onClick={() => {
              const next = !pinned;
              setPinned(next);
              localStorage.setItem('nivo-browser-pinned', String(next));
            }}
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        </div>
        {children}
      </aside>
      {/* Keep the opener outside the animated panel. Hovering it must not move or
          hide the target between pointerdown and click and hit the canvas below. */}
      <button
        className="browser-handle"
        aria-label="Näytä mallilista"
        aria-expanded={expanded || pinned}
        data-expanded={expanded || pinned}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') enter();
        }}
        onPointerLeave={leave}
        onClick={enter}
      >
        <ListTree size={17} />
      </button>
    </>
  );
}
