import { emissionSettings, lightPresets, type Appearance } from '../model/materials';
import { CommitCheckbox } from './CommitCheckbox';
import type { MaterialChange } from './MaterialSurface';

/** The same light controls in Model and Render; a light is still an ordinary editable part. */
export function EmissionControls({
  appearance,
  color,
  busy,
  onChange,
}: {
  appearance: Appearance;
  color: string;
  busy: boolean;
  onChange: MaterialChange;
}) {
  const emission = emissionSettings(appearance, color);
  const change = (patch: Partial<typeof emission>) =>
    onChange({ ...appearance, emission: { ...emission, ...patch } });
  return (
    <div className="light-editor">
      <label className="checkbox-label">
        <CommitCheckbox
          label="Valaiseva materiaali"
          checked={emission.enabled}
          disabled={busy}
          onChange={(enabled) => change({ enabled })}
        />
        Valaiseva materiaali
      </label>
      <label>
        Valaisin
        <select
          aria-label="Valaisimen esiasetus"
          value=""
          disabled={busy}
          onChange={(event) => {
            const preset = lightPresets.find((p) => p.id === event.target.value);
            if (preset) {
              const { id: _id, name: _name, ...settings } = preset;
              void change({ ...settings, enabled: true });
            }
          }}
        >
          <option value="">Valitse LED, taustavalo tai spotti…</option>
          {lightPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      {emission.enabled && (
        <>
          <label>
            Valon tyyppi
            <select
              aria-label="Valon tyyppi"
              value={emission.type}
              disabled={busy}
              onChange={(e) => void change({ type: e.target.value as 'surface' | 'spot' })}
            >
              <option value="surface">Valaiseva pinta · LED / taustavalo</option>
              <option value="spot">Kohdevalo · spotti</option>
            </select>
          </label>
          <div className="light-properties">
            <label>
              Valon väri
              <input
                aria-label="Valon väri"
                type="color"
                defaultValue={emission.color}
                key={emission.color}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== emission.color) void change({ color: e.target.value });
                }}
              />
            </label>
            <label>
              Voimakkuus · suhteellinen
              <input
                aria-label="Valon voimakkuus"
                type="number"
                min="0"
                max="100"
                step="0.5"
                key={emission.intensity}
                defaultValue={emission.intensity}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value && Number.isFinite(n) && n >= 0 && n <= 100)
                    void change({ intensity: n });
                  else e.target.value = String(emission.intensity);
                }}
              />
            </label>
          </div>
          {emission.type === 'spot' && (
            <>
              <label>
                Suunta osan mukaan
                <select
                  aria-label="Spotin suunta"
                  value={emission.direction}
                  disabled={busy}
                  onChange={(e) =>
                    void change({ direction: e.target.value as typeof emission.direction })
                  }
                >
                  {(['-z', 'z', '-y', 'y', '-x', 'x'] as const).map((d) => (
                    <option key={d} value={d}>
                      {
                        {
                          '-z': 'Alas −Z',
                          z: 'Ylös +Z',
                          '-y': 'Eteen −Y',
                          y: 'Taakse +Y',
                          '-x': 'Vasen −X',
                          x: 'Oikea +X',
                        }[d]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Keilan kulma (°)
                <input
                  aria-label="Spotin kulma"
                  type="number"
                  min="5"
                  max="160"
                  key={emission.angle}
                  defaultValue={emission.angle}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value && Number.isFinite(n) && n >= 5 && n <= 160)
                      void change({ angle: n });
                    else e.target.value = String(emission.angle);
                  }}
                />
              </label>
              <p className="muted">
                Suunta kääntyy osan mukana. Spotti valaisee myös nopeassa renderöinnin
                esikatselussa.
              </p>
            </>
          )}
          {emission.type === 'surface' && (
            <p className="muted">
              Nopea esikatselu näyttää rajatun määrän suoria valoja. Tarkentuva laskee myös katosta
              ja seinistä heijastuvan valon. Voimakkuus on toistaiseksi kerroin, ei lumenarvo.
            </p>
          )}
        </>
      )}
    </div>
  );
}
