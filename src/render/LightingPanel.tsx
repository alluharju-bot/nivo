import { useRef, type PointerEvent } from 'react';
import { Sun, Moon, LampDesk, Sunrise } from 'lucide-react';
import { lightingPresets, sunDefaults } from './lighting';
import type { RenderSettings } from './scene';

type Props = {
  settings: RenderSettings;
  busy: boolean;
  onPreview: (settings: RenderSettings) => void;
  onCommit: (settings?: RenderSettings) => void;
};

export function LightingPanel({ settings, busy, onPreview, onCommit }: Props) {
  const sun = settings.sun ?? sunDefaults;
  const rotating = useRef(false);
  const patch = (value: Partial<RenderSettings>) => onPreview({ ...settings, ...value });
  const patchSun = (value: Partial<typeof sun>) => patch({ sun: { ...sun, ...value } });
  const commit = (value: Partial<RenderSettings>) => onCommit({ ...settings, ...value });
  const direction = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.x - rect.width / 2,
      y = event.clientY - rect.y - rect.height / 2;
    if (Math.hypot(x, y) < 8) return;
    patchSun({ azimuth: Math.round(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360) });
  };
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    output: string,
    change: (value: number) => void,
  ) => (
    <label className="lighting-range">
      <span>
        {label}
        <output>{output}</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={busy}
        onChange={(e) => change(Number(e.target.value))}
        onPointerUp={() => onCommit()}
        onKeyUp={() => onCommit()}
        onBlur={() => onCommit()}
      />
    </label>
  );
  const icons = [LampDesk, Sun, Sunrise, Moon];
  const a = (sun.azimuth * Math.PI) / 180;
  return (
    <section className="lighting-panel" aria-label="Valaistuksen asetukset">
      <div className="lighting-presets">
        {lightingPresets.map((preset, i) => {
          const Icon = icons[i];
          return (
            <button
              key={preset.id}
              disabled={busy}
              className="lighting-preset"
              aria-pressed={Object.entries(preset.settings).every(
                ([key, value]) =>
                  JSON.stringify(
                    settings[key as keyof RenderSettings] ??
                      lightingPresets[0].settings[
                        key as keyof (typeof lightingPresets)[0]['settings']
                      ],
                  ) === JSON.stringify(value),
              )}
              title={preset.description}
              onClick={() => commit(preset.settings)}
            >
              <Icon size={19} />
              <span>
                {preset.name}
                <small>{preset.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      {range(
        'Valotus',
        settings.exposure,
        0.3,
        2.5,
        0.05,
        settings.exposure.toFixed(2),
        (exposure) => patch({ exposure }),
      )}
      <section className="sun-controls">
        <label className="lighting-toggle">
          <span>
            <Sun size={17} />
            Aurinko
          </span>
          <input
            aria-label="Aurinko"
            type="checkbox"
            checked={sun.enabled}
            disabled={busy}
            onChange={(e) => commit({ sun: { ...sun, enabled: e.target.checked } })}
          />
        </label>
        {sun.enabled && (
          <>
            <div className="sun-direction-row">
              <div
                className="light-compass"
                role="slider"
                aria-label="Auringon suunta"
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={sun.azimuth}
                aria-valuetext={`${sun.azimuth} astetta`}
                aria-disabled={busy}
                tabIndex={busy ? -1 : 0}
                onPointerDown={(e) => {
                  if (busy || e.button !== 0) return;
                  rotating.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  direction(e);
                }}
                onPointerMove={(e) => {
                  if (rotating.current) direction(e);
                }}
                onPointerUp={(e) => {
                  if (!rotating.current) return;
                  rotating.current = false;
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  onCommit();
                }}
                onPointerCancel={() => {
                  rotating.current = false;
                  onCommit();
                }}
                onKeyDown={(e) => {
                  const delta = ['ArrowRight', 'ArrowUp'].includes(e.key)
                    ? 5
                    : ['ArrowLeft', 'ArrowDown'].includes(e.key)
                      ? -5
                      : 0;
                  if (busy || (!delta && e.key !== 'Home')) return;
                  e.preventDefault();
                  commit({
                    sun: {
                      ...sun,
                      azimuth: e.key === 'Home' ? 0 : (sun.azimuth + delta + 360) % 360,
                    },
                  });
                }}
              >
                <svg viewBox="0 0 144 144" aria-hidden="true">
                  <circle cx="72" cy="72" r="54" className="compass-track" />
                  <path d="M72 25V119M25 72H119" className="compass-axis" />
                  <rect x="57" y="57" width="30" height="30" rx="5" className="compass-model" />
                  <line
                    x1="72"
                    y1="72"
                    x2={72 + Math.sin(a) * 54}
                    y2={72 - Math.cos(a) * 54}
                    className="compass-ray"
                  />
                  <circle
                    cx={72 + Math.sin(a) * 54}
                    cy={72 - Math.cos(a) * 54}
                    r="8"
                    className="compass-sun"
                  />
                  <text x="72" y="11" textAnchor="middle">
                    +Y
                  </text>
                  <text x="130" y="75">
                    +X
                  </text>
                </svg>
              </div>
              <div className="sun-direction-caption">
                <strong>{sun.azimuth}°</strong>
                <span>Vedä valoa kehällä</span>
                <small>Suunta mallin ympärillä</small>
              </div>
            </div>
            {range('Auringon korkeus', sun.elevation, 5, 85, 1, `${sun.elevation}°`, (elevation) =>
              patchSun({ elevation }),
            )}
            {range(
              'Auringon voimakkuus',
              sun.power,
              0,
              5,
              0.05,
              `${Math.round(sun.power * 100)} %`,
              (power) => patchSun({ power }),
            )}
            {range(
              'Auringon varjojen pehmeys',
              sun.softness,
              0.1,
              10,
              0.1,
              sun.softness < 1 ? 'Terävä' : sun.softness < 4 ? 'Pehmeä' : 'Laaja',
              (softness) => patchSun({ softness }),
            )}
            <label className="lighting-color">
              <span>Valon sävy</span>
              <input
                aria-label="Auringon väri"
                type="color"
                value={sun.color}
                disabled={busy}
                onChange={(e) => patchSun({ color: e.target.value })}
                onBlur={() => onCommit()}
              />
            </label>
            <div className="light-color-presets">
              {[
                ['#fff8ee', 'Päivänvalo'],
                ['#ffe1b3', 'Lämmin'],
                ['#ffd2a0', 'Iltavalo'],
                ['#d9e8ff', 'Viileä'],
              ].map(([color, name]) => (
                <button
                  key={color}
                  title={name}
                  aria-label={`Valon sävy: ${name}`}
                  disabled={busy}
                  style={{ backgroundColor: color }}
                  onClick={() => commit({ sun: { ...sun, color } })}
                />
              ))}
            </div>
          </>
        )}
      </section>
      <details className="lighting-studio" open={!sun.enabled}>
        <summary>Studio ja ympäristö</summary>
        {range(
          'Studiovalon suunta',
          settings.lightRotation ?? 0,
          0,
          360,
          1,
          `${settings.lightRotation ?? 0}°`,
          (lightRotation) => patch({ lightRotation }),
        )}
        {range(
          'Studiovalojen voimakkuus',
          settings.lightPower ?? 1,
          0,
          4,
          0.05,
          `${Math.round((settings.lightPower ?? 1) * 100)} %`,
          (lightPower) => patch({ lightPower }),
        )}
        {range(
          'Ympäristövalon voimakkuus',
          settings.environmentPower ?? 1,
          0,
          4,
          0.05,
          `${Math.round((settings.environmentPower ?? 1) * 100)} %`,
          (environmentPower) => patch({ environmentPower }),
        )}
        {range(
          'Studiovarjojen pehmeys',
          settings.studioSoftness ?? 1,
          0.1,
          3,
          0.1,
          `${Math.round((settings.studioSoftness ?? 1) * 100)} %`,
          (studioSoftness) => patch({ studioSoftness }),
        )}
        <label>
          Taustan tunnelma
          <select
            aria-label="Valaistus"
            disabled={busy}
            value={settings.environment}
            onChange={(e) =>
              commit({ environment: e.target.value as RenderSettings['environment'] })
            }
          >
            <option value="studio">Vaalea</option>
            <option value="warm">Lämmin</option>
            <option value="dark">Tumma</option>
          </select>
        </label>
        <label className="lighting-toggle">
          <span>Studion lattia</span>
          <input
            type="checkbox"
            aria-label="Studion lattia"
            checked={settings.ground ?? true}
            disabled={busy}
            onChange={(e) => commit({ ground: e.target.checked })}
          />
        </label>
        <label className="lighting-toggle">
          <span>Esikatselun varjot</span>
          <input
            type="checkbox"
            aria-label="Varjot"
            checked={settings.shadows}
            disabled={busy}
            onChange={(e) => commit({ shadows: e.target.checked })}
          />
        </label>
      </details>
      <p className="lighting-help">
        Säädöt näkyvät heti. Tarkentuva kuva laskee myös epäsuoran valon ja pehmeät varjot.
      </p>
    </section>
  );
}
