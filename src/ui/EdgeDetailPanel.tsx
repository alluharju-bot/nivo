import { Check, X } from 'lucide-react';
export function EdgeDetailPanel({
  retained,
  onRemove,
  onFinalize,
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
  onCorners,
  onFullRound,
}: {
  retained: boolean;
  onRemove: () => void;
  onFinalize: () => void;
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
  onCorners?: () => void;
  onFullRound?: () => void;
}) {
  return (
    <section className="edge-detail-panel" aria-label="Viisteet ja pyöristykset">
      <h2>{retained ? 'Muokkaa reunakäsittelyä' : 'Viimeistele reunat'}</h2>
      {retained && (
        <>
          <p>
            Valitse alkuperäisiä reunoja: kohtaavat kulmat lasketaan yhdessä. Napsautus lisää tai
            poistaa reunan käsittelystä.
          </p>
          <div className="object-quick-actions">
            <button disabled={busy} onClick={onRemove}>
              Poista käsittely
            </button>
            <button disabled={busy} onClick={onFinalize}>
              Viimeistele ja aloita uusi
            </button>
          </div>
          <p className="muted">
            Pinnan muu muokkaus (E, O, Cut tai Join) liittää tämän käsittelyn geometriaan.
          </p>
        </>
      )}
      <p>
        Vedä reunasta säätääksesi kokoa. Vapautus hyväksyy. Voit myös napsauttaa useita reunoja
        valintaan ja kirjoittaa tarkan mitan. Enter hyväksyy, Esc peruu.
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
        {onCorners && (
          <button disabled={busy} onClick={onCorners}>
            Muodon nurkat
          </button>
        )}
        {onFullRound && operation === 'fillet' && (
          <button disabled={busy} onClick={onFullRound}>
            Puolipyöreäksi
          </button>
        )}
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
        Valitusta reunasta vetäminen säätää koko reunavalintaa. Vastakkainen vetosuunta pienentää
        mittaa. Kirjoitettu mitta pysyy lukittuna vedon loppuun asti.
      </p>
    </section>
  );
}
