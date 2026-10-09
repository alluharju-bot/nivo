import { useState } from 'react';
import type { Body, Vec3 } from '../model/project';

export function CurvePointsPanel({
  body,
  disabled,
  onSnaps,
  onCurve,
}: {
  body: Body;
  disabled: boolean;
  onSnaps: (values: number[]) => void;
  onCurve: (points: Vec3[]) => Promise<void>;
}) {
  const [percent, setPercent] = useState('50');
  const [points, setPoints] = useState(
    body.curve?.points.map((p) =>
      p.map((n, i) => String(Number((n + body.origin[i]).toFixed(4)))),
    ) ?? [],
  );
  const [error, setError] = useState('');
  const stations = body.curveSnaps ?? [0, 0.25, 0.5, 0.75, 1];
  return (
    <details className="tool-advanced curve-points-panel" open>
      <summary>Käyrä ja tartuntapisteet</summary>
      <p className="muted">
        Pisteet helpottavat muiden muotojen asettelua. Niiden lisääminen ei muuta käyrää.
      </p>
      <div className="curve-snap-controls">
        <label>
          Sijainti %
          <input
            aria-label="Tartuntapisteen sijainti"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </label>
        <button
          disabled={disabled}
          onClick={() => {
            const t = Number(percent.replace(',', '.')) / 100;
            if (!percent.trim() || !Number.isFinite(t) || t < 0 || t > 1) {
              setError('Anna sijainti 0–100 %.');
              return;
            }
            if (stations.length >= 64) {
              setError('Käyrällä voi olla enintään 64 tartuntapistettä.');
              return;
            }
            setError('');
            onSnaps([...new Set([...stations, t])].sort((a, b) => a - b));
          }}
        >
          Lisää piste
        </button>
      </div>
      <div className="axis-locks">
        {[4, 8, 16].map((count) => (
          <button
            key={count}
            disabled={disabled}
            onClick={() => onSnaps(Array.from({ length: count + 1 }, (_, i) => i / count))}
          >
            {count} jakoa
          </button>
        ))}
      </div>
      <p className="muted">
        {[...new Set(stations)].map((t) => `${Math.round(t * 1000) / 10} %`).join(' · ')}
      </p>
      {body.curve && (
        <details>
          <summary>Muokkaa käyrän pisteitä</summary>
          <p className="muted">
            Pisteiden X/Y/Z-sijainnit millimetreinä. Käyrä päivittyy, kun hyväksyt muutoksen.
          </p>
          {points.map((point, index) => (
            <div className="curve-coordinate-row" key={index}>
              <span>{index + 1}</span>
              {point.map((value, k) => (
                <input
                  key={k}
                  aria-label={`Käyrän piste ${index + 1} ${['X', 'Y', 'Z'][k]}`}
                  value={value}
                  inputMode="decimal"
                  disabled={disabled}
                  onChange={(e) =>
                    setPoints((old) =>
                      old.map((p, i) =>
                        i === index ? p.map((n, j) => (j === k ? e.target.value : n)) : p,
                      ),
                    )
                  }
                />
              ))}
            </div>
          ))}
          <button
            className="button outlined full"
            disabled={disabled}
            onClick={() => {
              const values = points.map(
                (p) => p.map((v) => Number(v.trim().replace(',', '.'))) as Vec3,
              );
              if (values.some((p) => p.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000))) {
                setError('Tarkista pisteiden mitat.');
                return;
              }
              setError('');
              void onCurve(values);
            }}
          >
            Päivitä käyrä
          </button>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
