import { useEffect, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { EdgeDetailResult } from '../cad/protocol';
import type { SweepOptions } from '../cad/sweep';
import { featureIsSolid, type Body } from '../model/project';

export function SweepPanel({
  bodies,
  ids,
  onIds,
  cad,
  busy,
  onPreview,
  onCommit,
  onClose,
}: {
  bodies: Body[];
  ids: string[];
  onIds: (ids: string[]) => void;
  cad: CadClient;
  busy: boolean;
  onPreview: (result?: EdgeDetailResult) => void;
  onCommit: (result: EdgeDetailResult, ids: string[], hide: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<SweepOptions>({
    profile: 'circle',
    width: 25,
    height: 25,
    wall: 0,
    rotation: 0,
    name: 'Polkua pitkin',
  });
  const [hide, setHide] = useState(true);
  const [state, setState] = useState<{ key: string; result?: EdgeDetailResult; error?: string }>({
    key: '',
  });
  const path = bodies.find((b) => b.id === ids[0]);
  const key = JSON.stringify([path, options]);
  const result = state.key === key ? state.result : undefined;
  const error = state.key === key ? state.error : undefined;
  const change = (patch: Partial<SweepOptions>) => setOptions((o) => ({ ...o, ...patch }));
  useEffect(() => {
    let cancelled = false;
    onPreview(undefined);
    const timer = setTimeout(() => {
      if (path)
        void cad
          .sweep(path, options)
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
  const field = (label: string, key: 'width' | 'height' | 'wall' | 'rotation', min: number) => (
    <label className="modeling-field">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={key === 'rotation' ? 360000 : 100000}
        step="any"
        defaultValue={options[key]}
        onBlur={(e) => change({ [key]: Number(e.target.value) })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <section className="through-shapes-panel" aria-label="Polkua pitkin">
      <div className="loft-content">
        <div className="selection-heading">
          <h2>Polkua pitkin</h2>
          <button onClick={onClose} aria-label="Sulje polkutyökalu">
            ×
          </button>
        </div>
        <p className="muted">Valitse kynäviiva, Bézier-käyrä tai tasomuodon ulkoreuna.</p>
        <label className="modeling-field">
          Polku
          <select
            aria-label="Pursotuksen polku"
            value={path?.id ?? ''}
            onChange={(e) => onIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">Valitse polku…</option>
            {bodies
              .filter((b) => !featureIsSolid(b.feature))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <label className="modeling-field">
          Poikkileikkaus
          <select
            aria-label="Polun poikkileikkaus"
            value={options.profile}
            onChange={(e) => change({ profile: e.target.value as SweepOptions['profile'] })}
          >
            <option value="circle">Pyöreä</option>
            <option value="rectangle">Suorakulmainen</option>
          </select>
        </label>
        {field(options.profile === 'circle' ? 'Halkaisija · mm' : 'Leveys · mm', 'width', 0.1)}
        {options.profile === 'rectangle' && field('Korkeus · mm', 'height', 0.1)}
        {field('Seinämä · mm', 'wall', 0)}
        <small>0 = umpiosa. Seinämä tekee putken, jonka päät ovat avoimet.</small>
        {options.profile === 'rectangle' && field('Profiilin kierto · °', 'rotation', -360000)}
        <label className="checkbox-label">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          Piilota lähtöpolku hyväksyessä
        </label>
        <label className="modeling-field">
          Nimi
          <input
            aria-label="Polkuosan nimi"
            maxLength={120}
            value={options.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </label>
      </div>
      <footer className="loft-footer">
        <p role="status">
          {error ||
            (!path
              ? 'Valitse polku näkymästä tai listasta.'
              : result
                ? 'Esikatselu valmis.'
                : 'Lasketaan kappaletta…')}
        </p>
        <div className="loft-footer-actions">
          <button
            className="button dark full"
            disabled={!result || busy}
            onClick={() => result && void onCommit(result, [path!.id], hide)}
          >
            Luo kappale
          </button>
          <button className="button subtle full" onClick={onClose}>
            Peru · Esc
          </button>
        </div>
      </footer>
    </section>
  );
}
