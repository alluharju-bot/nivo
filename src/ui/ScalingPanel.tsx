import type { Body } from '../model/project';
import { bounds } from '../model/project';
import { bodiesCenter } from '../model/transforms';
import { scaleAxes, toggleScaleAxis, type Scaling } from '../model/scaling';

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
  const axes = scaleAxes(scaling.mode);
  const selected = bodies.filter((b) => scaling.ids.includes(b.id));
  const linked = selected.some(
    (b) =>
      b.component &&
      bodies.some((other) => other.id !== b.id && other.component?.id === b.component!.id),
  );
  return (
    <section className="rotation-panel scaling-panel" aria-label="Skaalauksen asetukset">
      <div className="axis-switch" role="group" aria-label="Skaalattavat akselit">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button
            key={axis}
            disabled={busy || (axes.length === 1 && axes.includes(axis))}
            aria-pressed={axes.includes(axis)}
            aria-label={`Skaalaa ${axis.toUpperCase()}-suunnassa`}
            onClick={() => onChange({ mode: toggleScaleAxis(scaling.mode, axis) })}
          >
            {axis.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="muted">Valitut akselit skaalautuvat yhdessä.</p>
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
