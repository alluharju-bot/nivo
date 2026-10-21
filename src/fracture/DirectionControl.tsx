import { useEffect, useState } from 'react';
import type { Vec3 } from '../model/project';
import { directionAngles, directionFromAngles } from './motion';

function AngleInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  return (
    <input
      aria-label={label}
      type="number"
      step="5"
      min={min}
      max={max}
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        // Keep intermediate input (empty, minus sign, decimals) while typing.
        // Deriving the text from a normalized vector on every key loses the sign.
        setText(e.target.value);
        if (e.target.value.trim() && Number.isFinite(e.target.valueAsNumber))
          onChange(e.target.valueAsNumber);
      }}
    />
  );
}

/** Same world directions as the modeling axes; numeric angles also allow oblique throws. */
export function DirectionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
}) {
  const [azimuth, elevation] = directionAngles(value);
  const axes: { name: string; value: Vec3 }[] = [
    { name: 'X+', value: [1, 0, 0] },
    { name: 'X−', value: [-1, 0, 0] },
    { name: 'Y+', value: [0, 1, 0] },
    { name: 'Y−', value: [0, -1, 0] },
    { name: 'Z+', value: [0, 0, 1] },
    { name: 'Z−', value: [0, 0, -1] },
  ];
  return (
    <div className="fracture-direction" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="fracture-axis-buttons">
        {axes.map((axis) => (
          <button
            key={axis.name}
            aria-label={`${label} ${axis.name}`}
            aria-pressed={axis.value.every((n, i) => Math.abs(n - value[i]) < 0.001)}
            onClick={() => onChange(axis.value)}
          >
            {axis.name}
          </button>
        ))}
      </div>
      <div className="fracture-angles">
        <label>
          Suunta °
          <AngleInput
            label={`${label} suuntakulma`}
            value={Math.round(azimuth * 10) / 10}
            onChange={(angle) => onChange(directionFromAngles(angle, elevation))}
          />
        </label>
        <label>
          Korkeus °
          <AngleInput
            label={`${label} korkeuskulma`}
            min={-90}
            max={90}
            value={Math.round(elevation * 10) / 10}
            onChange={(angle) =>
              onChange(directionFromAngles(azimuth, Math.max(-90, Math.min(90, angle))))
            }
          />
        </label>
      </div>
    </div>
  );
}
