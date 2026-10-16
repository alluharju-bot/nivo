import type { HighlightStyle } from '../model/highlightStyle';

export function HighlightStyleFields({
  value,
  disabled = false,
  onChange,
}: {
  value: HighlightStyle;
  disabled?: boolean;
  onChange: (patch: HighlightStyle) => void;
}) {
  return (
    <div className="note-style-fields">
      <label>
        Reunan tyyli
        <select
          aria-label="Korostuksen reunatyyli"
          disabled={disabled}
          value={value.lineStyle ?? 'solid'}
          onChange={(e) => onChange({ lineStyle: e.target.value as HighlightStyle['lineStyle'] })}
        >
          <option value="solid">Yhtenäinen</option>
          <option value="dashed">Katkoviiva</option>
          <option value="dotted">Pisteviiva</option>
        </select>
      </label>
      <label>
        Viivan paksuus
        <select
          aria-label="Korostuksen viivan paksuus"
          disabled={disabled}
          value={value.lineWidth ?? 2}
          onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
        >
          <option value={1}>Ohut</option>
          <option value={2}>Normaali</option>
          <option value={3}>Vahva</option>
          <option value={4}>Paksu</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={disabled}
          checked={(value.fillOpacity ?? 0) > 0}
          onChange={(e) => onChange({ fillOpacity: e.target.checked ? 0.12 : 0 })}
        />
        Kevyt taustaväri
      </label>
    </div>
  );
}
