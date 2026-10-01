import { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  LockKeyhole,
  Unlock,
  Trash2,
} from 'lucide-react';
import { bodyVisible } from '../model/transforms';
import type { Body, BodyGroup } from '../model/project';

export function ObjectTree({
  bodies,
  groups,
  selected,
  busy,
  onSelect,
  onSelectGroup,
  onBody,
  onGroup,
  onNewGroup,
  onRemoveGroup,
}: {
  bodies: Body[];
  groups: BodyGroup[];
  selected: string[];
  busy: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onSelectGroup: (id: string) => void;
  onBody: (id: string, patch: Partial<Body>) => void;
  onGroup: (id: string, patch: Partial<BodyGroup>) => void;
  onNewGroup: () => void;
  onRemoveGroup: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [renaming, setRenaming] = useState<string>();
  const row = (body: Body) => {
    const visible = bodyVisible(body, groups);
    return (
      <div
        key={body.id}
        className={`object-row ${body.locked ? 'held' : ''} ${visible ? '' : 'hidden-body'}`}
      >
        {renaming === body.id ? (
          <input
            className="object-select object-rename"
            autoFocus
            aria-label="Kappaleen uusi nimi"
            defaultValue={body.name}
            maxLength={120}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const name = e.target.value.trim();
              setRenaming(undefined);
              if (name && name !== body.name) onBody(body.id, { name });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                setRenaming(undefined);
              }
            }}
          />
        ) : (
          <button
            data-testid={`body-${body.id}`}
            className={`object-select ${selected.includes(body.id) ? 'selected' : ''}`}
            disabled={busy}
            onClick={(e) => onSelect(body.id, e.shiftKey || e.ctrlKey || e.metaKey)}
            onDoubleClick={() => setRenaming(body.id)}
            title={`${body.name} · kaksoisnapsauta nimetäksesi`}
          >
            <Box size={16} />
            <span>{body.name}</span>
          </button>
        )}
        <button
          className="object-action"
          disabled={busy}
          aria-label={`${body.locked ? 'Vapauta' : 'Kiinnitä'}: ${body.name}`}
          title={body.locked ? 'Vapauta · G' : 'Kiinnitä paikalleen · G'}
          aria-pressed={body.locked}
          onClick={() => onBody(body.id, { locked: !body.locked })}
        >
          {body.locked ? <LockKeyhole size={14} /> : <Unlock size={14} />}
        </button>
        <button
          className="object-action"
          disabled={busy}
          aria-label={`${body.hidden ? 'Näytä' : 'Piilota'}: ${body.name}`}
          title={body.hidden ? 'Näytä kappale' : 'Piilota kappale'}
          onClick={() => onBody(body.id, { hidden: !body.hidden })}
        >
          {visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>
    );
  };
  return (
    <div className="object-tree" aria-label="Kappaleet ja ryhmät">
      <div className="object-tree-heading">
        <strong>
          Kappaleet <small>{bodies.length}</small>
        </strong>
        <button
          disabled={busy}
          onClick={onNewGroup}
          aria-label="Uusi ryhmä"
          title="Luo ryhmä valituista kappaleista"
        >
          <FolderPlus size={16} /> Ryhmä
        </button>
      </div>
      <div className="object-list">
        {bodies.filter((b) => !b.groupId).map(row)}
        {groups.map((group) => (
          <section key={group.id} className="object-group" data-testid={`group-${group.id}`}>
            <div className="object-group-heading">
              <button
                aria-label={`${collapsed.has(group.id) ? 'Avaa' : 'Sulje'} ryhmä: ${group.name}`}
                aria-expanded={!collapsed.has(group.id)}
                onClick={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                {collapsed.has(group.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
              <input
                key={group.name}
                aria-label={`Ryhmän nimi: ${group.name}`}
                defaultValue={group.name}
                maxLength={120}
                disabled={busy}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== group.name) onGroup(group.id, { name });
                  else e.target.value = group.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button
                aria-label={`Valitse ryhmä: ${group.name}`}
                disabled={busy}
                onClick={() => onSelectGroup(group.id)}
                title="Valitse ryhmän kappaleet"
              >
                {bodies.filter((b) => b.groupId === group.id).length}
              </button>
              <button
                aria-label={`${group.hidden ? 'Näytä' : 'Piilota'} ryhmä: ${group.name}`}
                disabled={busy}
                onClick={() => onGroup(group.id, { hidden: !group.hidden })}
              >
                {group.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                aria-label={`Pura ryhmä: ${group.name}`}
                title="Pura ryhmä, säilytä kappaleet"
                disabled={busy}
                onClick={() => onRemoveGroup(group.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {!collapsed.has(group.id) && bodies.filter((b) => b.groupId === group.id).map(row)}
          </section>
        ))}
        {!bodies.length && !groups.length && <p className="empty-list">Ei vielä kappaleita.</p>}
      </div>
    </div>
  );
}
