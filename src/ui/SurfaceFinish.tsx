import { useEffect, useRef, useState } from 'react';
import { findPreset, type Appearance } from '../model/materials';

const finishes = [
  { id: 'matte', label: 'Matta', roughness: 1, clearcoat: 0 },
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
    appearance.roughness === undefined && appearance.clearcoat === undefined
      ? 'native'
      : (finishes.find(
          (f) =>
            Math.abs(f.roughness - roughness) < 1e-8 && Math.abs(f.clearcoat - clearcoat) < 1e-8,
        )?.id ?? 'custom');
  const commit = () => {
    if (gloss !== committed.current && !busy) {
      committed.current = gloss;
      // The finish slider controls the coating too: a glossy preset must not
      // retain a mirror-like clearcoat when the user requests zero gloss.
      void onChange({
        ...appearance,
        roughness: (100 - gloss) / 100,
        clearcoat: Math.min(clearcoat, gloss / 100),
      });
    }
  };
  return (
    <div className="surface-finish">
      {appearance.preset === 'mirror' && (
        <>
          <label>
            Peilipinta
            <select
              aria-label="Peilin puoli"
              disabled={busy}
              value={appearance.mirrorSide ?? 'front'}
              onChange={(e) =>
                void onChange({
                  ...appearance,
                  mirrorSide: e.target.value as Appearance['mirrorSide'],
                })
              }
            >
              <option value="front">Etupuoli</option>
              <option value="back">Kääntöpuoli</option>
              <option value="both">Molemmat puolet</option>
            </select>
          </label>
          <small>
            Peilipinta tulee levyn leveälle tahkolle. Mallin heijastukset näkyvät
            Tarkentuva-tilassa.
          </small>
        </>
      )}
      <label>
        Pintakäsittely
        <select
          aria-label="Pintakäsittely"
          disabled={busy}
          value={selected}
          onChange={(e) => {
            if (e.target.value === 'native') {
              const { roughness: _roughness, clearcoat: _clearcoat, ...native } = appearance;
              void onChange(native);
              return;
            }
            const finish = finishes.find((f) => f.id === e.target.value);
            if (finish)
              void onChange({
                ...appearance,
                roughness: finish.roughness,
                clearcoat: finish.clearcoat,
              });
          }}
        >
          <option value="native">Materiaalin oma</option>
          <option value="custom" disabled>
            Säädetty
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
