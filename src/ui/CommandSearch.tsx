import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { findCommands, type Command } from './commands';

export function CommandSearch({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const results = useMemo(() => findCommands(commands, query), [commands, query]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    host.current?.querySelector('input')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    host.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const run = (command?: Command) => {
    if (!command || command.reason) return;
    onClose();
    command.run();
  };
  return (
    <div
      className="command-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={host}
        className="command-search"
        role="dialog"
        aria-modal="true"
        aria-label="Hae toiminto"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (
            ['ArrowDown', 'ArrowUp'].includes(e.key) ||
            (!(e.target instanceof HTMLInputElement) && ['Home', 'End'].includes(e.key))
          ) {
            e.preventDefault();
            const next = Math.max(
              0,
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? results.length - 1
                  : (active + (e.key === 'ArrowDown' ? 1 : results.length - 1)) %
                    Math.max(1, results.length),
            );
            setActive(next);
            if (!(e.target instanceof HTMLInputElement))
              host.current?.querySelectorAll<HTMLButtonElement>('[role=option]')[next]?.focus();
          }
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault();
            run(results[active]);
          }
          if (e.key === 'Tab') {
            const items = [
              ...host.current!.querySelectorAll<HTMLElement>('input,button:not(:disabled)'),
            ];
            const at = items.indexOf(document.activeElement as HTMLElement);
            e.preventDefault();
            items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
          }
        }}
      >
        <header>
          <Search size={20} />
          <input
            aria-label="Etsi toimintoa"
            placeholder="Mitä haluat tehdä?"
            value={query}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <button aria-label="Sulje toimintohaku" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="command-results" id="command-results" role="listbox" aria-label="Toiminnot">
          {results.map((command, i) => (
            <button
              key={command.id}
              id={`command-${command.id}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={!!command.reason}
              data-active={i === active}
              onPointerMove={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => run(command)}
            >
              <span>
                <strong>{command.label}</strong>
                <small>{command.reason ?? command.group}</small>
              </span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {!results.length && (
            <p>
              Toimintoa ei löytynyt. Kokeile esimerkiksi ”siirrä”, ”materiaali” tai ”mittakuva”.
            </p>
          )}
        </div>
        <footer>↑ ↓ selaa · Enter käynnistää · Esc sulkee</footer>
      </div>
    </div>
  );
}
