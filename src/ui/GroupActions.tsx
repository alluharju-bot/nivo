import { Copy, Move3D, Maximize, FolderPlus, Trash2, Merge } from 'lucide-react';
import type { BodyGroup } from '../model/project';
import { groupContains, groupPath, groupAncestors } from '../model/groups';

export function GroupActions({
  group,
  groups,
  count,
  total,
  busy,
  onChange,
  onMove,
  onCopy,
  onFit,
  onSubgroup,
  onRemove,
  onMerge,
  canMerge,
}: {
  group: BodyGroup;
  groups: BodyGroup[];
  count: number;
  total: number;
  busy: boolean;
  onChange: (patch: Partial<BodyGroup>) => void;
  onMove: () => void;
  onCopy: () => void;
  onFit: () => void;
  onSubgroup: () => void;
  onRemove: () => void;
  onMerge: () => void;
  canMerge: boolean;
}) {
  const locked = groupAncestors(groups, group.id).some((g) => g.locked);
  return (
    <section className="group-actions-panel" aria-label="Ryhmän toiminnot">
      <p>
        {count} osaa valittu · ryhmässä {total}. Napsauta osia lisätäksesi tai poistaaksesi niitä
        valinnasta.
      </p>
      <div className="object-quick-actions">
        <button onClick={onMove} disabled={busy || !count || locked}>
          <Move3D size={15} /> Siirrä valinta
        </button>
        <button onClick={onCopy} disabled={busy || !count || locked}>
          <Copy size={15} /> Kopioi valinta
        </button>
        <button onClick={onFit} disabled={!count}>
          <Maximize size={15} /> Sovita valinta
        </button>
        <button onClick={onSubgroup} disabled={busy}>
          <FolderPlus size={15} /> Luo alaryhmä
        </button>
      </div>
      <details className="inspector-disclosure">
        <summary>Ryhmän asetukset</summary>
        <div className="disclosure-content">
          <label className="modeling-field">
            Nimi
            <input
              key={group.id + group.name}
              aria-label="Ryhmän nimi"
              defaultValue={group.name}
              disabled={busy}
              maxLength={120}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== group.name) onChange({ name });
                else e.target.value = group.name;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          <label className="modeling-field">
            Yläryhmä
            <select
              aria-label="Ryhmän yläryhmä"
              value={group.parentId ?? ''}
              disabled={busy}
              onChange={(e) => onChange({ parentId: e.target.value || undefined })}
            >
              <option value="">Päätaso</option>
              {groups
                .filter((g) => !groupContains(groups, group.id, g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupPath(groups, g.id)}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button outlined full"
            aria-label="Yhdistä valitut"
            disabled={busy || !canMerge}
            onClick={onMerge}
          >
            <Merge size={15} /> Yhdistä valitut kappaleeksi
          </button>
          <button
            className="button subtle full"
            aria-label={`Pura ryhmä: ${group.name}`}
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2 size={15} /> Pura ryhmä
          </button>
          <p className="muted">Purkaminen säilyttää kappaleet ja alaryhmät.</p>
        </div>
      </details>
    </section>
  );
}
