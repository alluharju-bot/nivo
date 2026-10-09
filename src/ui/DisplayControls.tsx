import { Box, Ghost, Square, Boxes, House, Camera, Eye } from 'lucide-react';
import type { MouseEvent } from 'react';
import {
  commonDisplayMode,
  displayLabels,
  displayModes,
  type DisplayMode,
  type ModelDisplay,
} from '../model/display';

const icons = { solid: Box, flat: Square, ghost: Ghost, wireframe: Boxes };
const descriptions = {
  solid: 'Materiaalit ja valaistus',
  flat: 'Tasainen pintaväri ilman valaistusta',
  ghost: 'Valinta menee läpi · pisteisiin ja reunoihin voi tarttua',
  wireframe: 'Kappaleiden reunat',
};

export function DisplayControls({
  display,
  ids,
  bodyIds,
  disabled,
  onChange,
  onOverview,
  onCapture,
  capturing,
  onVisibility,
}: {
  display?: ModelDisplay;
  ids: string[];
  bodyIds: string[];
  disabled: boolean;
  onChange: (mode: DisplayMode) => void;
  onOverview: () => void;
  onCapture: () => void;
  capturing: boolean;
  onVisibility: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const mode = commonDisplayMode(display, ids.length ? ids : bodyIds);
  const scope = ids.length ? `Valinta · ${ids.length} osaa` : 'Koko näkymä';
  return (
    <div className="display-controls" role="toolbar" aria-label="Näkymän pikatoiminnot">
      <button
        type="button"
        aria-label="Yleisnäkymä"
        title="Yleisnäkymä · koko malli näkyviin viistosta"
        onClick={onOverview}
      >
        <House size={18} aria-hidden="true" />
      </button>
      <span className="display-divider" aria-hidden="true" />
      <span className="display-scope" title={scope}>
        {ids.length ? `${ids.length} valittu` : 'Näkymä'}
      </span>
      {displayModes.map((value, index) => {
        const Icon = icons[value];
        return (
          <button
            key={value}
            type="button"
            aria-label={displayLabels[value]}
            title={`${displayLabels[value]} · ${index + 1} Valitse-tilassa\n${scope} · ${descriptions[value]}`}
            aria-pressed={mode === value}
            disabled={disabled}
            onClick={() => onChange(value)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
      <span className="display-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="Näkyvyys"
        aria-haspopup="menu"
        title="Piilota valinta · H / Näytä viimeksi piilotetut · Shift+H / Näytä kaikki · Alt+H"
        onClick={onVisibility}
      >
        <Eye size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Tallenna näkymä PNG"
        title="Tallenna nykyinen mallinnusnäkymä kuvaksi ilman käyttöliittymää"
        disabled={disabled || capturing}
        aria-busy={capturing}
        onClick={onCapture}
      >
        <Camera size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
