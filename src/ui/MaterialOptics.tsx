import { Check } from 'lucide-react';
import { findPreset, type Appearance } from '../model/materials';
import { useColorDraft } from './useColorDraft';

/** The same optional controls in the brush, part inspector and render workspace. */
export function MaterialOptics({
  appearance,
  busy,
  onChange,
}: {
  appearance: Appearance;
  busy: boolean;
  onChange: (appearance: Appearance) => unknown;
}) {
  const preset = findPreset(appearance.preset);
  const color = appearance.attenuationColor ?? preset.attenuationColor ?? '#ffffff';
  const { draft, change, cancel } = useColorDraft(color);
  if (
    !(appearance.transmission ?? preset.transmission) &&
    !['Lasit', 'Muovit', 'Geelit ja aerogeeli'].includes(preset.category)
  )
    return null;
  const fields = [
    {
      key: 'transmission',
      label: 'Läpäisy (%)',
      value: (appearance.transmission ?? preset.transmission ?? 0) * 100,
      min: 0,
      max: 100,
      step: 1,
      scale: 100,
    },
    {
      key: 'ior',
      label: 'Taittokerroin',
      value: appearance.ior ?? preset.ior ?? 1.5,
      min: 1,
      max: 2.333,
      step: 0.01,
      scale: 1,
    },
    {
      key: 'attenuationDistance',
      label: 'Sävyn syvyys (mm)',
      value: appearance.attenuationDistance ?? preset.attenuationDistance ?? 0,
      min: 0,
      max: 1_000_000,
      step: 1,
      scale: 1,
    },
  ] as const;
  const modified =
    appearance.ior !== undefined ||
    appearance.attenuationDistance !== undefined ||
    appearance.attenuationColor !== undefined ||
    appearance.transmission !== undefined;
  return (
    <>
      {preset.note && <small>{preset.note}</small>}
      <details className="material-optics">
        <summary>Läpäisy ja sisäinen sävy</summary>
        <div className="material-optics-fields">
          {fields.map(({ key, label, value, min, max, step, scale }) => (
            <label key={key}>
              {label}
              <input
                key={`${preset.id}:${value}`}
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step={step}
                defaultValue={Number(value.toFixed(6))}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    e.currentTarget.value = String(value);
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (!e.currentTarget.value.trim() || !Number.isFinite(n) || n < min || n > max) {
                    e.currentTarget.value = String(value);
                  } else if (Math.abs(n - value) > 1e-8) {
                    void onChange({ ...appearance, [key]: n / scale });
                  }
                }}
              />
            </label>
          ))}
          <label>
            Sisäinen sävy
            <div className="texture-tint">
              <input
                type="color"
                aria-label="Sisäinen sävy"
                value={draft}
                disabled={busy}
                onChange={(e) => change(e.target.value)}
              />
              <button
                type="button"
                aria-label="Käytä sisäistä sävyä"
                title="Käytä sisäistä sävyä"
                disabled={busy || draft.toLowerCase() === color.toLowerCase()}
                onClick={() => {
                  void onChange({ ...appearance, attenuationColor: draft });
                  cancel();
                }}
              >
                <Check size={16} />
              </button>
            </div>
          </label>
          <small>
            Pienempi syvyys voimistaa sävyä. 0 poistaa sisäisen sävytyksen. Kiilto säätää pinnan
            huurrettavuutta.
          </small>
          <button
            type="button"
            className="button outlined"
            disabled={busy || !modified}
            onClick={() => {
              const {
                ior: _ior,
                attenuationDistance: _distance,
                attenuationColor: _color,
                transmission: _transmission,
                ...native
              } = appearance;
              void onChange(native);
            }}
          >
            Palauta läpäisyn oletukset
          </button>
        </div>
      </details>
    </>
  );
}
