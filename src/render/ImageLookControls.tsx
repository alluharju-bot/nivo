import type { RenderSettings } from './scene';

export function ImageLookControls({
  settings,
  busy,
  onPreview,
  onCommit,
}: {
  settings: RenderSettings;
  busy: boolean;
  onPreview: (settings: RenderSettings) => void;
  onCommit: (settings?: RenderSettings) => void;
}) {
  const strength = settings.lookStrength ?? 0.5;
  const styled = ['soft', 'dream', 'mist'].includes(settings.look ?? '');
  return (
    <section aria-label="Kuvan viimeistely">
      <label className="image-look">
        Kuvan ilme
        <select
          aria-label="Kuvan ilme"
          value={settings.look ?? 'standard'}
          disabled={busy}
          onChange={(e) =>
            onCommit({ ...settings, look: e.target.value as RenderSettings['look'] })
          }
        >
          <option value="standard">Realistinen</option>
          <option value="filmic">Filminen</option>
          <option value="soft">Pehmeä hehku</option>
          <option value="dream">Unenomainen</option>
          <option value="mist">Utuinen</option>
        </select>
      </label>
      {styled && (
        <label className="lighting-range">
          <span>
            Tehosteen voimakkuus<output>{Math.round(strength * 100)} %</output>
          </span>
          <input
            aria-label="Tehosteen voimakkuus"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={strength}
            disabled={busy}
            onChange={(e) => onPreview({ ...settings, lookStrength: Number(e.target.value) })}
            onPointerUp={() => onCommit()}
            onKeyUp={() => onCommit()}
            onBlur={() => onCommit()}
          />
        </label>
      )}
      {styled && (
        <small>
          Hehku ja utu viimeistelevät kuvan. Voit säätää niitä myös renderin valmistuttua.
        </small>
      )}
    </section>
  );
}
