import { useEffect, useRef, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import {
  sameSelection,
  hasSelection,
  selectionDescription,
  type Activity,
  type SelectionContext,
} from '../model/activity';
export function ActivityHistory({
  entries,
  current,
  busy,
  onRestore,
  canRestoreOperation,
  onRestoreOperation,
}: {
  entries: Activity[];
  current: SelectionContext;
  busy: boolean;
  onRestore: (context: SelectionContext) => void;
  canRestoreOperation: (entry: Activity) => boolean;
  onRestoreOperation: (entry: Activity) => void;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    host.current?.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      host.current?.removeEventListener('keydown', escape);
    };
  }, [open]);
  const previous = entries.find(
    (e) => hasSelection(e.context) && !sameSelection(e.context, current),
  );
  const latest = entries.find((e) => e.kind !== 'selection');
  return (
    <div className="activity-history" ref={host}>
      {previous?.context && (
        <button
          className="restore-selection"
          disabled={busy}
          aria-label="Palauta edellinen valinta"
          title={`Palauta edellinen valinta · ${selectionDescription(previous.context)}`}
          onClick={() => onRestore(previous.context!)}
        >
          <RotateCcw size={14} />
          <span>Edellinen valinta</span>
        </button>
      )}
      <button
        className="activity-summary"
        aria-label="Toimintohistoria"
        aria-expanded={open}
        title={latest?.label ?? 'Viimeisimmät toiminnot ja niiden valinnat'}
        onClick={() => setOpen(!open)}
      >
        <History size={15} />
        <span>{latest ? `Viimeisin: ${latest.label}` : 'Toimintohistoria'}</span>
      </button>
      {open && (
        <section className="activity-popover" aria-label="Viimeisimmät toiminnot">
          <header>
            <strong>Viimeisimmät toiminnot</strong>
            <button aria-label="Sulje toimintohistoria" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <p>
            Palauta valinta poimii osat, viivat ja dimensiot. Palaa leikkaukseen palauttaa mallin
            ennen leikkausta ja avaa muodon sekä kohteet. Yläpalkin Palauta tekee myöhemmät
            muutokset uudelleen, kunnes teet uuden muutoksen.
          </p>
          {!entries.length ? (
            <p>Toiminnot ilmestyvät tähän työn edetessä.</p>
          ) : (
            <ol>
              {entries.map((entry) => (
                <li key={entry.id} data-activity-kind={entry.kind}>
                  <div>
                    <strong>{entry.label}</strong>
                    <time>
                      {new Date(entry.at).toLocaleTimeString('fi-FI', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  {entry.context && hasSelection(entry.context) && (
                    <div>
                      <span>Valinta: {selectionDescription(entry.context)}</span>
                      <button
                        disabled={busy}
                        aria-label={`Palauta valinta: ${selectionDescription(entry.context)} · ${entry.label}`}
                        onClick={() => {
                          onRestore(entry.context!);
                          setOpen(false);
                        }}
                      >
                        Palauta valinta
                      </button>
                    </div>
                  )}
                  {entry.operation && canRestoreOperation(entry) && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        onRestoreOperation(entry);
                        setOpen(false);
                      }}
                    >
                      {entry.actionId ? 'Palaa leikkaukseen' : 'Jatka leikkausta'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          <small>
            Enintään 100 merkintää tässä välilehdessä. Vanha valinta palauttaa mallissa yhä näkyvät
            osat.
          </small>
        </section>
      )}
    </div>
  );
}
