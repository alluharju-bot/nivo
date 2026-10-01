import { Copy, Move3D, Maximize, FolderPlus } from 'lucide-react';
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
}) {
  const locked = groupAncestors(groups, group.id).some((g) => g.locked);
  return (
    <section className="group-actions-panel" aria-label="Ryhmän toiminnot">
      <strong>{group.name}</strong>
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
    </section>
  );
}
