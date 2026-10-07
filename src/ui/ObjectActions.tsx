import { useState } from 'react';
import { Crosshair, LockKeyhole, RotateCw, Unlock } from 'lucide-react';
import type { Body, BodyGroup } from '../model/project';
import { groupPath } from '../model/groups';
import { BodyColor } from './BodyColor';

export function ObjectActions({
  body,
  groups,
  count,
  mixedColor,
  busy,
  onChange,
  onGroup,
  onOrigin,
  onRotate,
  onHold,
  onColor,
  onPreviewColor,
  onEdit,
  editing,
}: {
  body: Body;
  groups: BodyGroup[];
  count: number;
  mixedColor: boolean;
  busy: boolean;
  onChange: (patch: Partial<Body>) => void;
  onGroup: (groupId?: string) => void;
  onOrigin: (reference: 'min' | 'center') => void;
  onRotate: () => void;
  onHold: () => void;
  onColor: (color: string) => void;
  onPreviewColor?: (color?: string) => void;
  onEdit: () => void;
  editing: boolean;
}) {
  const [reference, setReference] = useState<'min' | 'center'>('min');
  return (
    <section className="object-actions-panel" aria-label="Kappaleen toiminnot">
      <div className="object-quick-actions">
        <button
          aria-label="Muokkaa osaa"
          onClick={onEdit}
          disabled={busy || body.locked || body.hidden || editing}
        >
          {editing ? 'Muokkaustila avoinna' : 'Muokkaa osaa'}
        </button>
        <button aria-label="Kierrä valittuja" onClick={onRotate} disabled={busy || body.locked}>
          <RotateCw size={16} /> Kierrä · R
        </button>
        <button
          aria-label="Kiinnitä paikalleen"
          aria-pressed={body.locked}
          className={body.locked ? 'held' : ''}
          title={body.locked ? 'Vapauta Hold ennen muokkaamista' : 'Hold estää osan muokkaamisen'}
          onClick={onHold}
          disabled={busy}
        >
          {body.locked ? <LockKeyhole size={16} /> : <Unlock size={16} />}
          {body.locked ? 'Vapauta Hold' : 'Kiinnitä'} · G
        </button>
      </div>
      {count > 1 && (
        <p className="muted">
          Siirto, kopiointi, väri, kierto, kiinnitys, origoon siirto ja ryhmä koskevat kaikkia{' '}
          {count} valittua.
        </p>
      )}
      <details className="inspector-disclosure">
        <summary>Ryhmä</summary>
        <div className="disclosure-content">
          <label className="modeling-field">
            Ryhmä
            <select
              aria-label="Kappaleen ryhmä"
              disabled={busy || body.locked}
              value={body.groupId ?? ''}
              onChange={(e) => onGroup(e.target.value || undefined)}
            >
              <option value="">Ei ryhmää</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {groupPath(groups, g.id)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <details className="inspector-disclosure">
        <summary>
          Väri <span className="color-summary" style={{ background: body.color }} />
        </summary>
        <div className="disclosure-content">
          <BodyColor
            key={body.id}
            color={body.color}
            mixed={mixedColor}
            busy={busy || !!body.locked}
            onChange={onColor}
            onPreview={onPreviewColor}
          />
        </div>
      </details>
      <details className="inspector-disclosure">
        <summary>Sijainti</summary>
        <div className="disclosure-content">
          <div className="origin-action">
            <select
              aria-label="Origoon kohdistettava piste"
              value={reference}
              onChange={(e) => setReference(e.target.value as 'min' | 'center')}
            >
              <option value="min">Alakulma</option>
              <option value="center">Keskipiste</option>
            </select>
            <button
              aria-label="Siirrä origoon"
              disabled={busy || body.locked}
              onClick={() => onOrigin(reference)}
            >
              <Crosshair size={16} /> Origoon
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
