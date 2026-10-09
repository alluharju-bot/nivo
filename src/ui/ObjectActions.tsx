import { GroupOptions } from './GroupOptions';
import { useState } from 'react';
import { Crosshair } from 'lucide-react';
import type { Body, BodyGroup } from '../model/project';
import { BodyColor } from './BodyColor';

export function ObjectActions({
  body,
  groups,
  mixedColor,
  busy,
  onGroup,
  onOrigin,
  onColor,
  onPreviewColor,
}: {
  body: Body;
  groups: BodyGroup[];
  mixedColor: boolean;
  busy: boolean;
  onGroup: (groupId?: string) => void;
  onOrigin: (reference: 'min' | 'center') => void;
  onColor: (color: string) => void;
  onPreviewColor?: (color?: string) => void;
}) {
  const [reference, setReference] = useState<'min' | 'center'>('min');
  return (
    <section className="object-actions-panel" aria-label="Kappaleen toiminnot">
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
              <GroupOptions groups={groups} />
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
