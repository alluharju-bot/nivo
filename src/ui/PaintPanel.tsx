import {
  defaultAppearance,
  materialPresets,
  findPreset,
  type Appearance,
} from '../model/materials';
import { SurfaceFinish } from './SurfaceFinish';
export function PaintPanel({
  appearance,
  color,
  count,
  all,
  linked,
  onChange,
  onAll,
  onLinked,
}: {
  appearance: Appearance;
  color: string;
  count: number;
  all: boolean;
  linked: boolean;
  onChange: (appearance: Appearance, color: string) => void;
  onAll: (all: boolean) => void;
  onLinked: (linked: boolean) => void;
}) {
  return (
    <section className="paint-panel" aria-label="Maalipensselin paletti">
      <h2>Maalipensseli</h2>
      <p className="muted">Valitse pinta ja napsauta maalattavaa osaa. P · Esc päättää.</p>
      <label>
        Materiaali
        <select
          aria-label="Pensselin materiaali"
          value={appearance.preset}
          onChange={(e) => {
            const preset = materialPresets.find((p) => p.id === e.target.value)!;
            onChange(defaultAppearance(preset.id), preset.color);
          }}
        >
          {[...new Set(materialPresets.map((p) => p.category))].map((category) => (
            <optgroup key={category} label={category}>
              {materialPresets
                .filter((p) => p.category === category)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Väri
        <input
          type="color"
          aria-label="Pensselin väri"
          value={color}
          onChange={(e) => onChange(appearance, e.target.value)}
        />
      </label>
      {count > 1 && (
        <label>
          Kohde
          <select
            aria-label="Maalauksen kohde"
            value={all ? 'selection' : 'single'}
            onChange={(e) => onAll(e.target.value === 'selection')}
          >
            <option value="selection">{count} valittua osaa</option>
            <option value="single">Vain napsautettu osa</option>
          </select>
        </label>
      )}
      {(appearance.assetId || findPreset(appearance.preset).pattern) && (
        <p className="muted">
          Väri sävyttää tekstuuria. Valkoinen säilyttää kuvan alkuperäiset värit.
        </p>
      )}
      <SurfaceFinish appearance={appearance} onChange={(value) => onChange(value, color)} />
      <label>
        Komponentin materiaali
        <select
          aria-label="Pensselin linkitetyt osat"
          value={linked ? 'shared' : 'local'}
          onChange={(e) => onLinked(e.target.value === 'shared')}
        >
          <option value="shared">Myös linkitetyt kopiot</option>
          <option value="local">Vain maalattavat esiintymät</option>
        </select>
      </label>
      <p className="muted">
        Maalaus säilyttää geometrian ja sijainnin. Peru kumoaa yhden maalauksen.
      </p>
    </section>
  );
}
