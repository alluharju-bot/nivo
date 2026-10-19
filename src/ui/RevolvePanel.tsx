import { useEffect, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { EdgeDetailResult } from '../cad/protocol';
import { featureIsSolid, type Body, type Vec3 } from '../model/project';
import { add } from '../model/geometry';
import type { RevolutionOptions } from '../model/revolution';

export interface AxisPicker {
  mode: 'point' | 'edge';
  onPick: (origin: Vec3, axis?: Vec3) => void;
}
export function RevolvePanel({
  bodies,
  ids,
  onIds,
  existing,
  cad,
  busy,
  onPreview,
  onCommit,
  onClose,
  onPick,
  onAxis,
  onRestoreProfile,
}: {
  bodies: Body[];
  ids: string[];
  onIds: (ids: string[]) => void;
  existing?: Body;
  cad: CadClient;
  busy: boolean;
  onPreview: (r?: EdgeDetailResult) => void;
  onCommit: (r: EdgeDetailResult, ids: string[], hide: boolean) => Promise<void>;
  onClose: () => void;
  onPick: (picker?: AxisPicker) => void;
  onAxis: (axis?: { origin: Vec3; direction: Vec3 }) => void;
  onRestoreProfile: () => void;
}) {
  const saved = existing?.feature.type === 'brep' ? existing.feature.revolution : undefined;
  const [options, setOptions] = useState<RevolutionOptions>(() => ({
    origin: saved ? add(existing!.origin, saved.origin) : [0, 0, 0],
    axis: saved?.axis ?? [0, 0, 1],
    angle: saved?.angle ?? 360,
    name: existing?.name ?? 'Pyöräytys',
  }));
  const [hide, setHide] = useState(!existing);
  const [axisEdited, setAxisEdited] = useState(false);
  const [picking, setPicking] = useState<'point' | 'edge'>();
  const [state, setState] = useState<{ key: string; result?: EdgeDetailResult; error?: string }>({
    key: '',
  });
  const path = bodies.find((b) => b.id === ids[0]);
  const key = JSON.stringify([path, options, existing]);
  const result = state.key === key ? state.result : undefined;
  const change = (patch: Partial<RevolutionOptions>) => {
    if (patch.origin || patch.axis) setAxisEdited(true);
    setOptions((o) => ({ ...o, ...patch }));
  };
  useEffect(() => {
    if (path && !saved && !axisEdited) {
      const f = path.feature;
      const axis: Vec3 =
        f.height > 1e-5 && (f.depth < 1e-5 || f.width < 1e-5) ? [0, 0, 1] : [0, 1, 0];
      setOptions((o) => ({ ...o, origin: path.origin, axis }));
    }
  }, [path?.id]);
  useEffect(() => {
    let cancelled = false;
    onPreview(undefined);
    const timer = setTimeout(() => {
      if (!path && !saved) return;
      void cad
        .revolve(path, options, existing)
        .then((result) => {
          if (!cancelled) {
            setState({ key, result });
            onPreview(result);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setState({ key, error: e.message });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      onPreview(undefined);
    };
  }, [key, cad, onPreview]);
  useEffect(() => {
    onAxis({ origin: options.origin, direction: options.axis });
    return () => onAxis(undefined);
  }, [options.origin, options.axis, onAxis]);
  useEffect(() => () => onPick(undefined), [onPick]);
  const pick = (mode: 'point' | 'edge') => {
    setPicking(mode);
    onPick({
      mode,
      onPick: (origin, axis) => {
        change({ origin, ...(axis ? { axis } : {}) });
        setPicking(undefined);
        onPick(undefined);
      },
    });
  };
  return (
    <section className="through-shapes-panel" aria-label="Pyöräytä">
      <div className="loft-content">
        <div className="selection-heading">
          <h2>{existing ? 'Muokkaa pyöräytystä' : 'Pyöräytä'}</h2>
          <button aria-label="Sulje pyöräytys" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="modeling-field">
          Profiili
          <select
            aria-label="Pyöräytyksen profiili"
            value={path?.id ?? ''}
            onChange={(e) => onIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">
              {saved ? `Tallennettu: ${saved.profileName}` : 'Valitse viiva tai tasomuoto…'}
            </option>
            {bodies
              .filter((b) => b.id !== existing?.id && !featureIsSolid(b.feature))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        {existing && (
          <small>
            Valitse muokattu lähtöprofiili listasta päivittääksesi muodon. Tallennettu profiili
            toimii myös ilman lähtöosaa.
          </small>
        )}
        {existing && (
          <button className="button outlined full" onClick={onRestoreProfile} disabled={busy}>
            Palauta profiili muokattavaksi
          </button>
        )}
        <label className="modeling-field">
          Kulma · °
          <input
            aria-label="Pyöräytyskulma"
            type="number"
            min={-360}
            max={360}
            step="any"
            value={options.angle}
            onChange={(e) => change({ angle: Number(e.target.value) })}
          />
        </label>
        <div className="object-quick-actions revolve-axis-choice">
          {(['X', 'Y', 'Z'] as const).map((v, i) => (
            <button
              key={v}
              aria-label={`Pyöräytysakseli ${v}`}
              aria-pressed={options.axis[i] === 1}
              onClick={() => change({ axis: [0, 1, 2].map((j) => (j === i ? 1 : 0)) as Vec3 })}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="object-quick-actions">
          <button onClick={() => pick('point')}>Poimi akselin piste</button>
          <button onClick={() => pick('edge')}>Poimi suora reuna</button>
        </div>
        {picking && (
          <p role="status">
            {picking === 'edge'
              ? 'Osoita suoraa reunaa kiertoakseliksi.'
              : 'Osoita akselin läpi kulkeva piste.'}
            <button
              onClick={() => {
                setPicking(undefined);
                onPick(undefined);
              }}
            >
              Lopeta poiminta
            </button>
          </p>
        )}
        <fieldset className="revolve-axis-fields">
          <legend>Akselin piste · mm</legend>
          {(['X', 'Y', 'Z'] as const).map((v, i) => (
            <label key={v}>
              {v}
              <input
                aria-label={`Pyöräytysakselin piste ${v}`}
                type="number"
                step="any"
                value={options.origin[i]}
                onChange={(e) =>
                  change({
                    origin: options.origin.map((n, j) =>
                      j === i ? Number(e.target.value) : n,
                    ) as Vec3,
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <details>
          <summary>Akselin suunta</summary>
          <div className="revolve-axis-fields">
            {(['X', 'Y', 'Z'] as const).map((v, i) => (
              <label key={v}>
                {v}
                <input
                  aria-label={`Pyöräytysakselin suunta ${v}`}
                  type="number"
                  step="any"
                  value={options.axis[i]}
                  onChange={(e) =>
                    change({
                      axis: options.axis.map((n, j) =>
                        j === i ? Number(e.target.value) : n,
                      ) as Vec3,
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <label className="modeling-field">
          Nimi
          <input
            aria-label="Pyöräytyksen nimi"
            maxLength={120}
            value={options.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </label>
        {!!path && (
          <label className="checkbox-label">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Piilota lähtöprofiili hyväksyessä
          </label>
        )}
      </div>
      <footer className="loft-footer">
        <p role="status">
          {state.key === key && state.error
            ? state.error
            : result
              ? `${featureIsSolid(result.body.feature) ? 'Umpiosa' : 'Pinta'} · esikatselu valmis.`
              : path || saved
                ? 'Lasketaan pyöräytystä…'
                : 'Valitse profiili näkymästä tai listasta.'}
        </p>
        <div className="loft-footer-actions">
          <button
            className="button dark full"
            disabled={!result || busy || !!picking}
            onClick={() => result && void onCommit(result, ids, hide)}
          >
            {existing ? 'Päivitä pyöräytys' : 'Luo pyörähdyskappale'}
          </button>
          <button className="button subtle full" onClick={onClose}>
            Peru · Esc
          </button>
        </div>
      </footer>
    </section>
  );
}
