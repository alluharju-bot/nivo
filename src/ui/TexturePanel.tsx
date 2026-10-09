import { useEffect, useState } from 'react';
import type { TexturePlacement } from '../model/materials';
import type { TextureVariation } from '../model/textureVariation';

function PlacementField({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onCommit: () => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 1000) / 1000)), [value]);
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        step="any"
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => {
          setText(String(Math.round(value * 1000) / 1000));
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function TexturePanel({
  texture,
  name,
  count,
  disabled,
  onChange,
  onCommit,
  onVary,
}: {
  texture?: TexturePlacement;
  name?: string;
  count: number;
  disabled: boolean;
  onChange: (texture: TexturePlacement) => void;
  onCommit: () => void;
  onVary: (options: TextureVariation) => void;
}) {
  const [spread, setSpread] = useState(20),
    [rotation, setRotation] = useState(0),
    [alignWood, setAlignWood] = useState(true);
  return (
    <section className="texture-editor" aria-label="Tekstuurin sijoittelu">
      <h3>{name ?? 'Tekstuurin sijoittelu'}</h3>
      <button
        className="button outlined full"
        disabled={disabled || !count}
        onClick={() => onVary({ spread: 0, rotation: 0, alignWood: true })}
      >
        Suuntaa puunsyyt pituussuuntaan
      </button>
      {texture && (
        <fieldset disabled={disabled} className="texture-placement-fields">
          <div className="texture-fields">
            {(['width', 'height', 'offsetX', 'offsetY', 'rotation'] as const).map((key) => (
              <PlacementField
                key={key}
                label={
                  {
                    width: 'Kuvion leveys (mm)',
                    height: 'Kuvion korkeus (mm)',
                    offsetX: 'Siirtymä U (mm)',
                    offsetY: 'Siirtymä V (mm)',
                    rotation: 'Tekstuurin kierto (°)',
                  }[key]
                }
                value={texture[key]}
                min={
                  key === 'width' || key === 'height' ? 0.1 : key === 'rotation' ? -360000 : -100000
                }
                max={key === 'rotation' ? 360000 : 100000}
                onChange={(n) => {
                  const next = { ...texture, [key]: n };
                  if (texture.lockAspect && key === 'width') next.height *= n / texture.width;
                  if (texture.lockAspect && key === 'height') next.width *= n / texture.height;
                  if (
                    next.width >= 0.1 &&
                    next.height >= 0.1 &&
                    next.width <= 100000 &&
                    next.height <= 100000
                  )
                    onChange(next);
                }}
                onCommit={onCommit}
              />
            ))}
          </div>
          <label className="render-check">
            <input
              type="checkbox"
              checked={texture.lockAspect}
              onChange={(e) => {
                onChange({ ...texture, lockAspect: e.target.checked });
                onCommit();
              }}
            />
            Lukitse kuvasuhde
          </label>
        </fieldset>
      )}
      {!texture && (
        <p className="muted">
          Valitse osa, jolla on puukuvio, muu pintakuvio tai oma tekstuurikuva. Lukittu osa pitää
          ensin vapauttaa.
        </p>
      )}
      <details className="texture-variation">
        <summary>Vaihtele tekstuuria · {count} osaa</summary>
        <p>Anna valituille osille eri lähtökohdat. Kuvion koko ja osien sijainnit säilyvät.</p>
        <label>
          Hajonta · ±{spread} % kuvion koosta
          <input
            aria-label="Tekstuurin hajonta"
            type="range"
            min="0"
            max="100"
            step="5"
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
          />
        </label>
        <label>
          Kierron vaihtelu
          <select
            aria-label="Kierron vaihtelu"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
          >
            <option value="0">Ei kiertoa</option>
            <option value="2">±2°</option>
            <option value="5">±5°</option>
            <option value="10">±10°</option>
          </select>
        </label>
        <label className="render-check">
          <input
            type="checkbox"
            checked={alignWood}
            onChange={(e) => setAlignWood(e.target.checked)}
          />
          Puun syyt pituussuuntaan
        </label>
        <p className="muted">
          Suuntaus koskee valmiita puukuvioita. Kopion muoto pysyy linkitettynä; kuvion sijainti on
          osakohtainen.
        </p>
        <button
          className="button outlined full"
          disabled={disabled || !count}
          onClick={() => onVary({ spread: spread / 100, rotation, alignWood })}
        >
          Vaihtele valitut tekstuurit
        </button>
      </details>
    </section>
  );
}
