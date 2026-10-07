import { useEffect, useRef, useState } from 'react';
import { findPreset, type Appearance } from '../model/materials';

const finishes = [
  { id: 'matte', label: 'Matta', roughness: 0.85, clearcoat: 0 },
  { id: 'satin', label: 'Silkinhimmeä', roughness: 0.55, clearcoat: 0.05 },
  { id: 'semi', label: 'Puolikiiltävä', roughness: 0.3, clearcoat: 0.15 },
  { id: 'gloss', label: 'Kiiltävä', roughness: 0.12, clearcoat: 0.35 },
];

/** These values feed both the modeling and path-traced material library. */
export function SurfaceFinish({
  appearance,
  busy = false,
  onChange,
}: {
  appearance: Appearance;
  busy?: boolean;
  onChange: (appearance: Appearance) => unknown;
}) {
  const preset = findPreset(appearance.preset);
  const roughness = appearance.roughness ?? preset.roughness;
  const clearcoat = appearance.clearcoat ?? preset.clearcoat ?? 0;
  const percent = Math.round((1 - roughness) * 100);
  const [gloss, setGloss] = useState(percent);
  const committed = useRef(percent);
  useEffect(() => {
    setGloss(percent);
    committed.current = percent;
  }, [percent, appearance]);
  const selected =
    finishes.find(
      (f) => Math.abs(f.roughness - roughness) < 1e-8 && Math.abs(f.clearcoat - clearcoat) < 1e-8,
    )?.id ?? 'custom';
  const commit = () => {
    if (gloss !== committed.current && !busy) {
      committed.current = gloss;
      void onChange({ ...appearance, roughness: (100 - gloss) / 100 });
    }
  };
  return (
    <div className="surface-finish">
      <label>
        Pintakäsittely
        <select
          aria-label="Pintakäsittely"
          disabled={busy}
          value={selected}
          onChange={(e) => {
            const finish = finishes.find((f) => f.id === e.target.value);
            if (finish)
              void onChange({
                ...appearance,
                roughness: finish.roughness,
                clearcoat: finish.clearcoat,
              });
          }}
        >
          <option value="custom" disabled>
            Materiaalin oma / säädetty
          </option>
          {finishes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="surface-gloss">
        <span>
          Kiilto <output>{gloss} %</output>
        </span>
        <input
          type="range"
          aria-label="Kiilto"
          min={0}
          max={100}
          step={1}
          value={gloss}
          disabled={busy}
          onChange={(e) => setGloss(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <small>
          Matta <span>Kiiltävä</span>
        </small>
      </label>
    </div>
  );
}
