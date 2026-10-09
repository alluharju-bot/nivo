import { GroupOptions } from './GroupOptions';
import { Copy, Move3D, Maximize, FolderPlus, Trash2, Merge } from 'lucide-react';
import type { BodyGroup } from '../model/project';
import { groupAncestors } from '../model/groups';

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
  onEdit,
  onUnique,
  canUnique,
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
  onEdit: () => void;
  onUnique: () => void;
  canUnique: boolean;
}) {
  const locked = groupAncestors(groups, group.id).some((g) => g.locked);
  return (
    <section className="group-actions-panel" aria-label="Ryhmän toiminnot">
      <p>
        {group.kind === 'assembly'
          ? `${total} osan kokoonpano. Mallissa osan napsautus valitsee koko kokoonpanon.`
          : `Ryhmä järjestää mallia kansion tavoin. ${count} osaa valittu · ryhmässä ${total}. Mallissa voit valita osat erikseen.`}
      </p>
      <div className="object-quick-actions">
        {group.kind === 'assembly' && (
          <button
            className="button outlined"
            disabled={busy || locked || group.hidden || !total}
            onClick={onEdit}
          >
            Muokkaa osia
          </button>
        )}
        <button
          disabled={busy}
          onClick={onRemove}
          title="Osat ja alaryhmät säilyvät ylemmällä tasolla"
        >
          <Trash2 size={15} /> Poista ryhmä
        </button>
        <button
          disabled={busy || groupAncestors(groups, group.parentId).some((g) => g.locked)}
          onClick={() => onChange({ locked: !group.locked })}
        >
          {group.locked ? 'Vapauta Hold' : 'Kiinnitä · G'}
        </button>
        <button disabled={busy} onClick={() => onChange({ hidden: !group.hidden })}>
          {group.hidden ? 'Näytä' : 'Piilota'}
        </button>
        <button onClick={onMove} disabled={busy || !count || locked}>
          <Move3D size={15} /> Siirrä valinta
        </button>
        <button onClick={onCopy} disabled={busy || !count || locked}>
          <Copy size={15} /> Kopioi valinta
        </button>
        {canUnique && (
          <button
            onClick={onUnique}
            disabled={busy || locked}
            title="Irrota ryhmän osat ulkopuolisista kopioista. Sisäiset linkit säilyvät."
          >
            Tee ryhmä uniikiksi
          </button>
        )}
        <button onClick={onFit} disabled={!count}>
          <Maximize size={15} /> Sovita valinta
        </button>
        <button onClick={onSubgroup} disabled={busy}>
          <FolderPlus size={15} /> Luo alaryhmä
        </button>
      </div>
      <p className="muted">Ryhmän poistaminen säilyttää osat ja alaryhmät ylemmällä tasolla.</p>
      <details className="inspector-disclosure">
        <summary>Ryhmän asetukset</summary>
        <div className="disclosure-content">
          <label className="modeling-field">
            Yläryhmä
            <select
              aria-label="Ryhmän yläryhmä"
              value={group.parentId ?? ''}
              disabled={busy}
              onChange={(e) => onChange({ parentId: e.target.value || undefined })}
            >
              <option value="">Päätaso</option>
              <GroupOptions groups={groups} movingGroupId={group.id} />
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
        </div>
      </details>
    </section>
  );
}
