import { Check, X } from 'lucide-react';
export function EdgeDetailPanel({
  operation,
  onOperation,
  count,
  bodyName,
  all,
  clear,
  busy,
  loading,
  error,
  onAccept,
  onCancel,
}: {
  operation: 'fillet' | 'chamfer';
  onOperation: (value: 'fillet' | 'chamfer') => void;
  count: number;
  bodyName?: string;
  all: () => void;
  clear: () => void;
  busy: boolean;
  loading: boolean;
  error?: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="edge-detail-panel" aria-label="Viisteet ja pyöristykset">
      <h2>Viimeistele reunat</h2>
      <p>
        Klikkaa yhtä tai useaa reunaa. Uusi napsautus poistaa reunan valinnasta. Tarkista esikatselu
        ja hyväksy.
      </p>
      <label className="modeling-field">
        Reunakäsittely
        <select
          aria-label="Reunakäsittely"
          value={operation}
          onChange={(e) => onOperation(e.target.value as 'fillet' | 'chamfer')}
          disabled={busy}
        >
          <option value="fillet">Pyöristys</option>
          <option value="chamfer">Viiste</option>
        </select>
      </label>
      <p>
        {bodyName ?? 'Valitse osa mallista'} · {count} reunaa valittu
      </p>
      <div className="object-quick-actions">
        <button disabled={!bodyName || busy} onClick={all}>
          Kaikki reunat
        </button>
        <button disabled={!count || busy} onClick={clear}>
          Tyhjennä reunavalinta
        </button>
      </div>
      {loading && <p role="status">Lasketaan esikatselua…</p>}
      {error && (
        <p role="alert" className="detail-error">
          {error}
        </p>
      )}
      <button
        className="button dark full"
        onClick={onAccept}
        disabled={busy || loading || !!error || !count}
      >
        <Check size={16} /> Hyväksy reunakäsittely
      </button>
      <button className="button outlined full" onClick={onCancel}>
        <X size={16} /> Peru · Esc
      </button>
      <p className="muted">
        Pyöristyksen mitta on säde. Viiste käyttää samaa etäisyyttä reunan molemmilla pinnoilla.
        Peru palauttaa alkuperäiset reunat.
      </p>
    </section>
  );
}
