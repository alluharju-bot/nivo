import { useEffect, useId, useState } from 'react';

/** Range for quick adjustments, a draft-preserving field for exact values. */
export function RangeNumber({
  label,
  ariaLabel = label,
  value,
  min,
  max,
  step = 1,
  sliderMin = min,
  sliderMax = max,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  sliderMin?: number;
  sliderMax?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  return (
    <div className="fracture-range-number">
      <label htmlFor={id}>{label}</label>
      <div className="fracture-range-inputs">
        <input
          type="range"
          aria-label={`Liukusäädin: ${ariaLabel.toLocaleLowerCase('fi')}`}
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={Math.max(sliderMin, Math.min(sliderMax, value))}
          onChange={(e) => {
            setEditing(false);
            onChange(e.target.valueAsNumber);
          }}
        />
        <input
          id={id}
          type="number"
          aria-label={ariaLabel}
          min={min}
          max={max}
          step={step}
          value={text}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            setText(e.target.value);
            const number = e.target.valueAsNumber;
            if (e.target.value.trim() && Number.isFinite(number) && number >= min && number <= max)
              onChange(number);
          }}
        />
      </div>
    </div>
  );
}
