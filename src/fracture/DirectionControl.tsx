import { RangeNumber } from './RangeNumber';
import type { Vec3 } from '../model/project';
import { directionAngles, directionFromAngles } from './motion';

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
      <RangeNumber
        label="Suunta °"
        ariaLabel={`${label} suuntakulma`}
        min={-180}
        max={180}
        step={1}
        value={Math.round(azimuth * 10) / 10}
        onChange={(angle) => onChange(directionFromAngles(angle, elevation))}
      />
      <RangeNumber
        label="Korkeus °"
        ariaLabel={`${label} korkeuskulma`}
        min={-90}
        max={90}
        step={1}
        value={Math.round(elevation * 10) / 10}
        onChange={(angle) => onChange(directionFromAngles(azimuth, angle))}
      />
    </div>
  );
}
