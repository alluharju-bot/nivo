import type { Body } from '../model/project';
import { bounds } from '../model/project';
import { bodiesCenter } from '../model/transforms';
import type { Scaling } from '../model/scaling';

export function ScalingPanel({
  scaling,
  bodies,
  busy,
  onChange,
}: {
  scaling?: Scaling;
  bodies: Body[];
  busy: boolean;
  onChange: (patch: Partial<Scaling>) => void;
}) {
  if (!scaling) return null;
  const selected = bodies.filter((b) => scaling.ids.includes(b.id));
  const linked = selected.some(
    (b) =>
      b.component &&
      bodies.some((other) => other.id !== b.id && other.component?.id === b.component!.id),
  );
  return (
    <section className="rotation-panel scaling-panel" aria-label="Skaalauksen asetukset">
      <div className="axis-switch" aria-label="Skaalaussuunta">
        {(['uniform', 'x', 'y', 'z'] as const).map((mode) => (
          <button
            key={mode}
            disabled={busy}
            aria-pressed={scaling.mode === mode}
            aria-label={
              mode === 'uniform' ? 'Skaalaa tasaisesti' : `Skaalaa ${mode.toUpperCase()}-suunnassa`
            }
            onClick={() => onChange({ mode })}
          >
            {mode === 'uniform' ? 'Tasainen' : mode.toUpperCase()}
          </button>
        ))}
      </div>
      <span className="eyebrow">KIINTOPISTE</span>
      <div className="rotation-picks">
        <button
          disabled={busy}
          onClick={() => onChange({ pivot: bodiesCenter(selected), picking: false })}
        >
          Keskipiste
        </button>
        <button
          disabled={busy}
          onClick={() => onChange({ pivot: bounds(selected).min, picking: false })}
        >
          Alakulma
        </button>
        <button
          disabled={busy}
          aria-pressed={!!scaling.picking}
          onClick={() => onChange({ picking: !scaling.picking })}
        >
          Poimi piste
        </button>
      </div>
      {linked && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            disabled={busy}
            checked={!!scaling.unique}
            onChange={(e) => onChange({ unique: e.target.checked })}
          />
          Vain valitut · tee uniikeiksi
        </label>
      )}
      <p className="muted">
        Reiät ja seinämät skaalautuvat mukana.
        {linked && !scaling.unique ? ' Koko muuttuu myös linkitetyissä kopioissa.' : ''}
      </p>
    </section>
  );
}
