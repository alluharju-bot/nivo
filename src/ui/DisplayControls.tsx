import { Box, Ghost, Square, Boxes, House, Camera, Eye, ChevronDown } from 'lucide-react';
import { useId, useRef, useState, type MouseEvent } from 'react';
import {
  commonDisplayMode,
  bodyGhostOpacity,
  displayLabels,
  displayModes,
  type DisplayMode,
  type ModelDisplay,
} from '../model/display';

import { defaultModelFov } from '../render/cameraLens';
import type { CaptureFormat } from '../viewport/capture';

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
  captureFormat,
  onFormat,
  modelFov,
  onFov,
  lensDisabled,
  onCapture,
  capturing,
  onVisibility,
  onOpacityPreview,
  onOpacity,
}: {
  display?: ModelDisplay;
  ids: string[];
  bodyIds: string[];
  disabled: boolean;
  onChange: (mode: DisplayMode) => void;
  onOverview: () => void;
  captureFormat: CaptureFormat;
  onFormat: (format: CaptureFormat) => void;
  modelFov: number;
  onFov: (fov: number) => void;
  lensDisabled: boolean;
  onCapture: () => void;
  capturing: boolean;
  onVisibility: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpacityPreview: (opacity?: number) => void;
  onOpacity: (opacity: number) => void;
}) {
  const optionsId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number>();
  const mode = commonDisplayMode(display, ids.length ? ids : bodyIds);
  const scope = ids.length ? `Valinta · ${ids.length} osaa` : 'Koko näkymä';
  const transparent = Math.round((1 - bodyGhostOpacity(display, ids[0] ?? '')) * 100);
  const commit = (value: number) => {
    setDraft(undefined);
    onOpacity(1 - value / 100);
  };
  return (
    <>
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
          className="model-camera-trigger"
          aria-label="Kamera"
          title="Kamera · kuva-asetukset"
          aria-controls={optionsId}
          popoverTarget={optionsId}
          disabled={disabled || capturing}
          aria-busy={capturing}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            menu.current?.style.setProperty('--camera-right', rect.right + 'px');
            menu.current?.style.setProperty('--camera-bottom', rect.bottom + 'px');
          }}
        >
          <Camera size={18} aria-hidden="true" />
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={menu}
        role="group"
        id={optionsId}
        popover="auto"
        className="model-camera-settings"
        aria-label="Kameran asetukset"
      >
        <label>
          PNG-kuvan koko
          <select value={captureFormat} onChange={(e) => onFormat(e.target.value as CaptureFormat)}>
            <option value="screen">Näkymän kuvasuhde</option>
            <option value="a3-landscape">A3 vaaka · 300 ppi</option>
            <option value="a3-portrait">A3 pysty · 300 ppi</option>
          </select>
        </label>
        <label>
          Kuvakulma · {modelFov}°
          <input
            type="range"
            aria-label="Perspektiivin kuvakulma"
            min="20"
            max="110"
            step="1"
            value={modelFov}
            disabled={lensDisabled}
            onChange={(e) => onFov(Number(e.target.value))}
          />
        </label>
        {lensDisabled && <small>Säädä linssiä mallinnuksen perspektiivinäkymässä.</small>}
        <button type="button" disabled={lensDisabled} onClick={() => onFov(defaultModelFov)}>
          Palauta oletuslinssi
        </button>
        <button
          type="button"
          className="button dark"
          disabled={disabled || capturing}
          onClick={() => {
            menu.current?.hidePopover();
            onCapture();
          }}
        >
          Ota kuva
        </button>
      </div>
      {mode === 'ghost' && (
        <label className="display-opacity" onKeyDown={(e) => e.stopPropagation()}>
          <span>
            Läpinäkyvyys <output>{draft ?? transparent} %</output>
          </span>
          <input
            aria-label="Mallinnusnäkymän läpinäkyvyys"
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={draft ?? transparent}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              setDraft(n);
              onOpacityPreview(1 - n / 100);
            }}
            onPointerUp={(e) => commit(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (
                [
                  'ArrowLeft',
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowDown',
                  'Home',
                  'End',
                  'PageUp',
                  'PageDown',
                ].includes(e.key)
              )
                commit(Number(e.currentTarget.value));
            }}
            onBlur={(e) => {
              if (draft !== undefined) commit(Number(e.currentTarget.value));
            }}
            onPointerCancel={() => {
              setDraft(undefined);
              onOpacityPreview(undefined);
            }}
          />
          <small>{ids.length ? 'Valitut osat' : 'Koko näkymä'} · vain mallinnusnäkymässä</small>
        </label>
      )}
    </>
  );
}
