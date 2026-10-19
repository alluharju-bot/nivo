import { useEffect, useMemo, useState } from 'react';
import type { CadClient } from '../cad/client';
import type { Project, Vec3 } from '../model/project';
import { defaultAlignment, type AlignmentAnchor } from '../model/alignment';
import { bodyVisible } from '../model/transforms';
import { SelectionDialog } from './SelectionDialog';

export function AlignmentPanel({
  project,
  ids,
  targetId,
  onTarget,
  cad,
  busy,
  onPreview,
  onApply,
  onClose,
}: {
  project: Project;
  ids: string[];
  targetId?: string;
  onTarget: (id: string) => void;
  cad: CadClient;
  busy: boolean;
  onPreview: (offset?: Vec3) => void;
  onApply: (offset: Vec3) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(defaultAlignment);
  const [state, setState] = useState<{ key: string; offset?: Vec3; error?: string }>({ key: '' });
  const sources = useMemo(
    () => project.bodies.filter((b) => ids.includes(b.id)),
    [project.bodies, ids],
  );
  const target = project.bodies.find((b) => b.id === targetId);
  const key = JSON.stringify([sources, target, options]);
  const offset = state.key === key ? state.offset : undefined;
  useEffect(() => {
    let cancelled = false;
    onPreview(undefined);
    const timer = setTimeout(() => {
      if (!target) return;
      void cad
        .align(sources, target, options)
        .then((offset) => {
          if (!cancelled) {
            setState({ key, offset });
            onPreview(offset);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setState({ key, error: e.message });
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      onPreview(undefined);
    };
  }, [key, cad, onPreview]);
  const anchor = (which: 'source' | 'target', i: number) => (
    <select
      aria-label={`${'XYZ'[i]} ${which === 'source' ? 'siirrettävän' : 'vertailuosan'} kohta`}
      value={options[which][i]}
      disabled={!options.axes[i] || busy}
      onChange={(e) =>
        setOptions((o) => ({
          ...o,
          [which]: o[which].map((v, j) => (j === i ? (e.target.value as AlignmentAnchor) : v)),
        }))
      }
    >
      <option value="min">{i === 2 ? 'Alareuna' : 'Alkureuna'}</option>
      <option value="center">Keskipiste</option>
      <option value="max">{i === 2 ? 'Yläreuna' : 'Loppureuna'}</option>
    </select>
  );
  return (
    <SelectionDialog
      title="Kohdista"
      side
      interactive
      onClose={onClose}
      onAccept={() => offset && onApply(offset)}
    >
      <p className="muted">
        {ids.length} osaa siirtyy yhdessä. Osoita vertailuosa näkymästä tai valitse listasta.
      </p>
      <label className="modeling-field">
        Vertailuosa
        <select
          aria-label="Kohdistuksen vertailuosa"
          value={targetId ?? ''}
          onChange={(e) => onTarget(e.target.value)}
          disabled={busy}
        >
          <option value="">Valitse vertailuosa…</option>
          {project.bodies
            .filter((b) => !ids.includes(b.id) && bodyVisible(b, project.groups))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </label>
      <label className="modeling-field">
        Akselit
        <select
          aria-label="Kohdistuksen akselisto"
          value={options.frame}
          onChange={(e) => setOptions((o) => ({ ...o, frame: e.target.value as typeof o.frame }))}
        >
          <option value="world">Maailman X / Y / Z</option>
          <option value="target">Vertailuosan omat akselit</option>
        </select>
      </label>
      <div className="alignment-grid">
        <small>Akseli</small>
        <small>Siirrettävä</small>
        <small>Vertailuosa</small>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div className="alignment-row" key={axis}>
            <button
              aria-label={`Kohdista ${axis}`}
              aria-pressed={options.axes[i]}
              onClick={() =>
                setOptions((o) => ({
                  ...o,
                  axes: o.axes.map((v, j) => (i === j ? !v : v)) as [boolean, boolean, boolean],
                }))
              }
            >
              {axis}
            </button>
            {anchor('source', i)}
            {anchor('target', i)}
          </div>
        ))}
      </div>
      <p className="muted" role="status">
        {state.key === key && state.error
          ? state.error
          : offset
            ? `Siirtymä: ${offset.map((v, i) => `${'XYZ'[i]} ${Number(v.toFixed(3))} mm`).join(' · ')}`
            : target
              ? 'Lasketaan esikatselua…'
              : 'Vertailuosa pysyy paikallaan.'}
      </p>
      <div className="dialog-actions">
        <button
          className="button dark"
          disabled={
            busy ||
            !offset ||
            !options.axes.some(Boolean) ||
            !offset.some((v) => Math.abs(v) > 1e-7)
          }
          onClick={() => offset && onApply(offset)}
        >
          Hyväksy kohdistus
        </button>
        <button className="button subtle" onClick={onClose}>
          Peru · Esc
        </button>
      </div>
    </SelectionDialog>
  );
}
