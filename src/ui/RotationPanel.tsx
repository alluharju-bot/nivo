import { Crosshair, MousePointer2 } from 'lucide-react';
import type { Rotation } from '../model/transforms';
import type { Vec3 } from '../model/project';
import { parseLength } from '../model/units';
import { axisVector } from '../model/geometry';

export function RotationPanel({
  rotation,
  busy,
  onChange,
  onCenter,
  onError,
}: {
  rotation?: Rotation;
  busy: boolean;
  onChange: (patch: Partial<Rotation>) => void;
  onCenter: () => void;
  onError: (message: string) => void;
}) {
  if (!rotation)
    return <p className="panel-description">Valitse kierrettävä kappale listasta tai näkymästä.</p>;
  return (
    <section className="rotation-panel" aria-label="Kierron asetukset">
      <p className="muted">
        Vedä värillistä rengasta tai kirjoita kulma. Shift porrastaa vedon 15 asteeseen. Enter tai
        vedon päättäminen hyväksyy.
      </p>
      <div className="axis-switch" aria-label="Kiertoakseli">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <button
            key={axis}
            disabled={busy}
            aria-label={`Kierrä ${axis.toUpperCase()}-akselin ympäri`}
            aria-pressed={Math.abs(rotation.axis[i]) > 0.9999}
            onClick={() => onChange({ axis: axisVector(axis), picking: undefined })}
          >
            {axis.toUpperCase()}
          </button>
        ))}
      </div>
      <span className="eyebrow">KIERTOPISTE</span>
      <div className="rotation-picks">
        <button disabled={busy} onClick={onCenter}>
          Keskipiste
        </button>
        <button disabled={busy} onClick={() => onChange({ pivot: [0, 0, 0], picking: undefined })}>
          <Crosshair size={14} /> Origo
        </button>
        <button
          disabled={busy}
          aria-pressed={rotation.picking === 'point'}
          onClick={() => onChange({ picking: rotation.picking === 'point' ? undefined : 'point' })}
        >
          <MousePointer2 size={14} /> Poimi kiertopiste
        </button>
        <button
          disabled={busy}
          aria-pressed={rotation.picking === 'edge'}
          onClick={() => onChange({ picking: rotation.picking === 'edge' ? undefined : 'edge' })}
        >
          Poimi kiertoakseli reunasta
        </button>
      </div>
      <div className="rotation-coordinates">
        {rotation.pivot.map((value, i) => (
          <label key={i}>
            {['X', 'Y', 'Z'][i]}
            <input
              key={value}
              aria-label={`Kiertopiste ${['X', 'Y', 'Z'][i]}`}
              defaultValue={Number(value.toFixed(3))}
              disabled={busy}
              inputMode="decimal"
              onBlur={(e) => {
                try {
                  const pivot = [...rotation.pivot] as Vec3;
                  pivot[i] = parseLength(e.target.value, true, true);
                  onChange({ pivot });
                } catch (error) {
                  onError((error as Error).message);
                  e.target.value = String(value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
        ))}
      </div>
      {rotation.picking && (
        <p className="rotation-pick-hint">
          {rotation.picking === 'edge'
            ? 'Osoita suoraa reunaa: se määrää kiertoakselin.'
            : 'Poimi verteksi, reuna, pinnan kohta tai vapaa piste.'}
        </p>
      )}
    </section>
  );
}
