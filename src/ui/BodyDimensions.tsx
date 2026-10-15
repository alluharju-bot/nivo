import { useEffect, useState } from 'react';
import { editableDimensions, type DimensionKey } from '../model/editableDimensions';
import { parseLength } from '../model/units';
import type { Body } from '../model/project';

export function BodyDimensions({
  body,
  busy,
  linkedCount,
  onChange,
}: {
  body: Body;
  busy: boolean;
  linkedCount: number;
  onChange: (changes: { key: DimensionKey; value: number }[], unique: boolean) => Promise<boolean>;
}) {
  const fields = editableDimensions(body);
  const [draft, setDraft] = useState<Partial<Record<DimensionKey, string>>>({});
  const [unique, setUnique] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setDraft({});
    setError('');
  }, [body.feature, body.edgeTreatment]);
  if (!fields.length) return null;
  const edited = Object.keys(draft).length > 0;
  const apply = async () => {
    if (busy || !edited) return;
    try {
      const changes = fields
        .filter((f) => draft[f.key] !== undefined)
        .map((f) => ({ key: f.key, value: parseLength(draft[f.key]!, f.signed, f.zero) }))
        .filter((c) => c.value !== fields.find((f) => f.key === c.key)!.value);
      if (!changes.length || (await onChange(changes, unique))) {
        setDraft({});
        setError('');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="body-dimensions inspector-disclosure">
      <summary>Muokkaa mittoja</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        {fields.map((f) => (
          <label key={f.key}>
            <span>
              {f.label}
              <small> mm</small>
            </span>
            <input
              aria-label={`Osan ${f.label.toLowerCase()}`}
              data-testid={`part-dimension-${f.key}`}
              inputMode="decimal"
              disabled={busy}
              value={draft[f.key] ?? String(f.value)}
              onChange={(e) => {
                setDraft((old) => ({ ...old, [f.key]: e.target.value }));
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft({});
                  setError('');
                }
              }}
            />
          </label>
        ))}
        <p className="muted">
          {body.feature.type === 'profile-extrusion' &&
          ['circle', 'ellipse'].includes(body.feature.profile.kind)
            ? 'Keskipiste ja piirtotaso pysyvät paikallaan.'
            : 'Aloituskulma pysyy paikallaan. Ulkomitat kasvavat positiiviseen suuntaan.'}
        </p>
        {linkedCount > 1 && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={unique}
              disabled={busy}
              onChange={(e) => setUnique(e.target.checked)}
            />
            Muokkaa vain tätä osaa · tee uniikki
          </label>
        )}
        {linkedCount > 1 && !unique && (
          <p className="muted">Mitat jaetaan {linkedCount} linkitettyyn osaan.</p>
        )}
        {edited && (
          <div className="geometry-selection-actions">
            <button type="submit" className="button dark" disabled={busy}>
              Päivitä mitat
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft({});
                setError('');
              }}
            >
              Peru
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
