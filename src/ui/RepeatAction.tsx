import { Repeat2 } from 'lucide-react';
export function RepeatAction({
  copy,
  parts,
  offset,
  count,
  busy,
  onCount,
  onRepeat,
}: {
  copy: boolean;
  parts: number;
  offset: string;
  count: string;
  busy: boolean;
  onCount: (count: string) => void;
  onRepeat: () => void;
}) {
  const valid = /^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= 1000;
  return (
    <section className="repeat-action" aria-label="Toista viimeisin siirto">
      <strong>
        {copy ? 'Toista kopiointi' : 'Toista siirto'} · {parts} {parts === 1 ? 'osa' : 'osaa'}
      </strong>
      <small>{offset}</small>
      <div>
        <button className="button" disabled={busy || !valid} onClick={onRepeat}>
          <Repeat2 size={16} />
          Toista
        </button>
        <label>
          Lisätoistoja
          <input
            aria-label="Lisätoistojen määrä"
            inputMode="numeric"
            value={count}
            disabled={busy}
            onChange={(e) => onCount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (valid && !busy) onRepeat();
              }
            }}
          />
        </label>
      </div>
      <p>
        {copy
          ? 'Jokainen uusi kopio samalla välillä.'
          : 'Sama valinta liikkuu saman matkan joka toistolla.'}{' '}
        Peru kumoaa koko sarjan.
      </p>
    </section>
  );
}
