import { useEffect, useRef, useState } from 'react';
import { emissionSettings, lightPresets, type Appearance, type Emission } from '../model/materials';
import { emissionDirection } from '../model/emission';
import { CommitCheckbox } from './CommitCheckbox';
import type { MaterialChange } from './MaterialSurface';

/** The same light controls in Model and Render; a light is still an ordinary editable part. */
export function EmissionControls({
  appearance,
  color,
  busy,
  onChange,
  onEmissionChange,
  onAnglePreview,
}: {
  appearance: Appearance;
  color: string;
  busy: boolean;
  onChange?: MaterialChange;
  onEmissionChange?: (patch: Partial<Emission>) => unknown;
  onAnglePreview?: (angle?: number) => void;
}) {
  const emission = emissionSettings(appearance, color);
  const change = async (patch: Partial<typeof emission>) =>
    onEmissionChange
      ? onEmissionChange(patch)
      : onChange?.({ ...appearance, emission: { ...emission, ...patch } });
  const [angle, setAngle] = useState(emission.angle);
  const committedAngle = useRef(emission.angle);
  useEffect(() => {
    setAngle(emission.angle);
    committedAngle.current = emission.angle;
  }, [emission.angle]);
  const commitAngle = () => {
    onAnglePreview?.();
    if (angle !== committedAngle.current && !busy) {
      committedAngle.current = angle;
      void change({ angle });
    }
  };
  const direction = emissionDirection(emission);
  const yaw = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;
  const elevation = (Math.asin(Math.max(-1, Math.min(1, direction[2]))) * 180) / Math.PI;
  const turn = (azimuth: number, height: number) => {
    const a = (azimuth * Math.PI) / 180,
      h = (height * Math.PI) / 180;
    void change({ aim: [Math.cos(a) * Math.cos(h), Math.sin(a) * Math.cos(h), Math.sin(h)] });
  };
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
                  value={emission.aim ? 'custom' : emission.direction}
                  disabled={busy}
                  onChange={(e) =>
                    void change({
                      direction: e.target.value as typeof emission.direction,
                      aim: undefined,
                    })
                  }
                >
                  {emission.aim && (
                    <option value="custom" disabled>
                      Oma suunta
                    </option>
                  )}
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
              <details className="light-direction-numbers">
                <summary>Tarkka suunta</summary>
                <div className="light-properties">
                  {(
                    [
                      ['Suunnan kierto (°)', yaw, -180, 180],
                      ['Suunnan korkeus (°)', elevation, -90, 90],
                    ] as const
                  ).map(([label, value, min, max], index) => (
                    <label key={label}>
                      {label}
                      <input
                        type="number"
                        aria-label={label}
                        min={min}
                        max={max}
                        step="1"
                        key={value}
                        defaultValue={Math.round(value * 10) / 10}
                        disabled={busy}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value && Number.isFinite(n) && n >= min && n <= max) {
                            if (Math.abs(n - value) > 0.051)
                              turn(index === 0 ? n : yaw, index === 1 ? n : elevation);
                          } else e.target.value = String(Math.round(value * 10) / 10);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <label>
                Keilan leveys · {angle}°
                <input
                  type="range"
                  min="5"
                  max="160"
                  step="1"
                  aria-label="Keilan leveys"
                  value={angle}
                  disabled={busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setAngle(n);
                    onAnglePreview?.(n);
                  }}
                  onPointerUp={commitAngle}
                  onKeyUp={commitAngle}
                  onBlur={commitAngle}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAngle(emission.angle);
                      onAnglePreview?.();
                    }
                  }}
                />
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
