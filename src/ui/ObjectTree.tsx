import { useMemo, useState } from 'react';
import { VirtualTreeRows } from './VirtualTreeRows';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  LockKeyhole,
  Unlock,
  Layers2,
  Boxes,
  Link2,
} from 'lucide-react';
import { groupAncestors, groupContains, bodyLocked, type TreeMove } from '../model/groups';
import { bodyVisible } from '../model/transforms';
import type { Body, BodyGroup } from '../model/project';
import { useTreeDrag } from './useTreeDrag';

export function ObjectTree({
  bodies,
  groups,
  selected,
  selectedGroupId,
  busy,
  arrangingDisabled,
  multiSelect,
  onMultiSelect,
  onSelect,
  onSelectGroup,
  onBody,
  onGroup,
  onNewGroup,
  onMove,
}: {
  bodies: Body[];
  groups: BodyGroup[];
  selected: string[];
  selectedGroupId?: string;
  busy: boolean;
  arrangingDisabled: boolean;
  multiSelect: boolean;
  onMultiSelect: () => void;
  onSelect: (id: string, additive: boolean) => void;
  onSelectGroup: (id: string) => void;
  onBody: (id: string, patch: Partial<Body>) => void;
  onGroup: (id: string, patch: Partial<BodyGroup>) => void;
  onNewGroup: () => void;
  onMove: (move: TreeMove, parentId?: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [renaming, setRenaming] = useState<string>();
  const { tree, drag, start, suppressClick } = useTreeDrag(
    groups,
    busy || arrangingDisabled,
    (move, parentId) => {
      if (parentId)
        setCollapsed((old) => {
          const next = new Set(old);
          next.delete(parentId);
          return next;
        });
      onMove(move, parentId);
    },
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const { byGroup, children, groupCounts } = useMemo(() => {
    const byGroup = new Map<string | undefined, Body[]>();
    const children = new Map<string | undefined, BodyGroup[]>();
    const groupCounts = new Map<string, number>();
    for (const body of bodies) {
      const list = byGroup.get(body.groupId) ?? [];
      list.push(body);
      byGroup.set(body.groupId, list);
      for (const group of groupAncestors(groups, body.groupId))
        groupCounts.set(group.id, (groupCounts.get(group.id) ?? 0) + 1);
    }
    for (const group of groups) {
      const list = children.get(group.parentId) ?? [];
      list.push(group);
      children.set(group.parentId, list);
    }
    return { byGroup, children, groupCounts };
  }, [bodies, groups]);
  type FlatRow =
    | { kind: 'body'; body: Body; depth: number }
    | { kind: 'group'; group: BodyGroup; depth: number };
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    const seen = new Set<string>();
    const append = (id?: string, depth = 0) => {
      for (const body of byGroup.get(id) ?? []) rows.push({ kind: 'body', body, depth });
      for (const group of children.get(id) ?? []) {
        if (seen.has(group.id)) continue;
        seen.add(group.id);
        rows.push({ kind: 'group', group, depth });
        if (!collapsed.has(group.id)) append(group.id, depth + 1);
      }
    };
    append();
    return rows;
  }, [byGroup, children, collapsed]);
  const dropClass = (id: string) =>
    drag?.drop?.id === id ? (drag.drop.allowed ? ' tree-drop-active' : ' tree-drop-invalid') : '';
  const rename = (item: Body | BodyGroup, kind: 'body' | 'group') => (
    <input
      className={kind === 'body' ? 'object-select object-rename' : 'object-rename group-rename'}
      autoFocus
      aria-label={kind === 'body' ? 'Kappaleen uusi nimi' : `Ryhmän nimi: ${item.name}`}
      defaultValue={item.name}
      maxLength={120}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const name = e.target.value.trim();
        setRenaming(undefined);
        if (name && name !== item.name) (kind === 'body' ? onBody : onGroup)(item.id, { name });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.currentTarget.value = item.name;
          setRenaming(undefined);
        }
      }}
    />
  );
  const row = (body: Body) => {
    const visible = bodyVisible(body, groups),
      held = bodyLocked(body, groups);
    const inheritedHold = groupAncestors(groups, body.groupId).some((g) => g.locked);
    const ids = selectedSet.has(body.id) ? selected : [body.id];
    return (
      <div
        key={body.id}
        data-tree-drop={body.groupId ?? ''}
        className={`object-row ${held ? 'held' : ''} ${visible ? '' : 'hidden-body'} ${drag?.move.kind === 'bodies' && drag.move.ids.includes(body.id) ? 'tree-dragging' : ''}`}
      >
        {renaming === body.id ? (
          rename(body, 'body')
        ) : (
          <button
            data-testid={`body-${body.id}`}
            className={`object-select ${selectedSet.has(body.id) ? 'selected' : ''}`}
            disabled={busy}
            aria-pressed={selectedSet.has(body.id)}
            onPointerDown={(e) =>
              start(
                e,
                { kind: 'bodies', ids },
                ids.length > 1 ? `${ids.length} kappaletta` : body.name,
              )
            }
            onClick={(e) => onSelect(body.id, e.shiftKey || e.ctrlKey || e.metaKey)}
            onDoubleClick={() => setRenaming(body.id)}
            onKeyDown={(e) => {
              if (e.key === 'F2') {
                e.preventDefault();
                setRenaming(body.id);
              }
            }}
            title={`${body.name} · vedä ryhmään · kaksoisnapsauta tai F2 nimeää`}
          >
            <span className="tree-drag-grip" aria-hidden="true">
              <GripVertical size={15} />
            </span>
            <span>{body.name}</span>
            {body.component && <Link2 size={12} aria-label="Linkitetty komponentti" />}
          </button>
        )}
        <button
          className="object-action"
          disabled={busy || inheritedHold}
          aria-label={`${body.locked ? 'Vapauta' : 'Kiinnitä'}: ${body.name}`}
          title={
            inheritedHold
              ? 'Yläryhmä on kiinnitetty'
              : body.locked
                ? 'Vapauta · G'
                : 'Kiinnitä paikalleen · G'
          }
          aria-pressed={held}
          onClick={() => onBody(body.id, { locked: !body.locked })}
        >
          {held ? <LockKeyhole size={14} /> : <Unlock size={14} />}
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
  const groupHeading = (group: BodyGroup) => {
    const ancestors = groupAncestors(groups, group.id);
    return (
      <div className={`object-group-heading${dropClass(group.id)}`} data-tree-drop={group.id}>
        <button
          className="group-collapse"
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
        {renaming === group.id ? (
          rename(group, 'group')
        ) : (
          <button
            className="group-select"
            aria-label={`Valitse ryhmä: ${group.name}`}
            disabled={busy}
            aria-pressed={selectedGroupId === group.id}
            onPointerDown={(e) => start(e, { kind: 'group', id: group.id }, group.name)}
            onClick={() => onSelectGroup(group.id)}
            onDoubleClick={() => setRenaming(group.id)}
            onKeyDown={(e) => {
              if (e.key === 'F2') {
                e.preventDefault();
                setRenaming(group.id);
              }
            }}
            title={`${group.name} · vedä ryhmään · kaksoisnapsauta tai F2 nimeää`}
          >
            <span className="tree-drag-grip" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            <span>
              {group.kind === 'assembly' && <Boxes size={13} aria-label="Kokoonpano" />}{' '}
              {group.name}
            </span>
            <small>{groupCounts.get(group.id) ?? 0}</small>
          </button>
        )}
        <button
          className="object-action"
          aria-label={`${group.locked ? 'Vapauta' : 'Kiinnitä'} ryhmä: ${group.name}`}
          title="Ryhmän kiinnitys · G"
          aria-pressed={ancestors.some((g) => g.locked)}
          disabled={busy || ancestors.slice(1).some((g) => g.locked)}
          onClick={() => onGroup(group.id, { locked: !group.locked })}
        >
          {ancestors.some((g) => g.locked) ? <LockKeyhole size={14} /> : <Unlock size={14} />}
        </button>
        <button
          className="object-action"
          aria-label={`${group.hidden ? 'Näytä' : 'Piilota'} ryhmä: ${group.name}`}
          title={group.hidden ? 'Näytä ryhmä' : 'Piilota ryhmä'}
          disabled={busy}
          onClick={() => onGroup(group.id, { hidden: !group.hidden })}
        >
          {ancestors.some((g) => g.hidden) ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    );
  };
  const groupRows = (parentId?: string): React.ReactNode =>
    groups
      .filter((g) => g.parentId === parentId)
      .map((group) => {
        return (
          <section
            key={group.id}
            className={`object-group ${selectedGroupId === group.id ? 'selected-group' : ''} ${drag?.move.kind === 'group' && drag.move.id === group.id ? 'tree-dragging' : ''}`}
            data-testid={`group-${group.id}`}
          >
            {groupHeading(group)}
            {!collapsed.has(group.id) && (
              <div className="object-group-children">
                {bodies.filter((b) => b.groupId === group.id).map(row)}
                {groupRows(group.id)}
                {!bodies.some((b) => b.groupId === group.id) &&
                  !groups.some((g) => g.parentId === group.id) && (
                    <div className={`group-empty${dropClass(group.id)}`} data-tree-drop={group.id}>
                      Vedä kappaleita tähän
                    </div>
                  )}
              </div>
            )}
          </section>
        );
      });
  return (
    <div
      ref={tree}
      className={`object-tree ${drag ? 'tree-arranging' : ''}`}
      aria-label="Kappaleet ja ryhmät"
      data-body-count={bodies.length}
      onPointerDownCapture={() => {
        suppressClick.current = false;
      }}
      onClickCapture={(e) => {
        if (suppressClick.current && e.detail > 0) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="object-tree-heading">
        <button
          aria-pressed={multiSelect}
          onClick={onMultiSelect}
          title="Valitse useita myös Ctrl- tai Shift-napsautuksella"
        >
          Monivalinta
        </button>
        <button
          disabled={busy || arrangingDisabled}
          onClick={onNewGroup}
          aria-label="Uusi ryhmä"
          title="Luo ryhmä valituista kappaleista"
        >
          <FolderPlus size={16} /> Ryhmä
        </button>
      </div>
      <div
        className={`tree-root-drop${dropClass('')}`}
        data-tree-drop=""
        data-testid="tree-root-drop"
      >
        <Layers2 size={14} /> Päätaso{' '}
        <span>{drag ? 'Pudota tähän' : 'Vedä tähän pois ryhmästä'}</span>
      </div>
      {bodies.length + groups.length > 400 ? (
        <VirtualTreeRows
          items={flatRows}
          itemKey={(item) => (item.kind === 'body' ? item.body.id : item.group.id)}
          activeKey={
            renaming ?? selectedGroupId ?? (selected.length === 1 ? selected[0] : undefined)
          }
          render={(item) => (
            <div style={{ paddingLeft: Math.min(item.depth, 12) * 9 }}>
              {item.kind === 'body' ? (
                row(item.body)
              ) : (
                <section
                  className={`object-group ${selectedGroupId === item.group.id ? 'selected-group' : ''}`}
                  data-testid={`group-${item.group.id}`}
                >
                  {groupHeading(item.group)}
                </section>
              )}
            </div>
          )}
        />
      ) : (
        <div className="object-list">
          {bodies.filter((b) => !b.groupId).map(row)}
          {groupRows()}
          {!bodies.length && !groups.length && <p className="empty-list">Ei vielä kappaleita.</p>}
        </div>
      )}
      <span className="sr-only" role="status">
        {drag
          ? `${drag.label}: ${drag.drop ? (drag.drop.allowed ? `Siirrä: ${drag.drop.name}` : 'Ei sallittu') : 'Valitse kohderyhmä'}`
          : ''}
      </span>
      {drag &&
        createPortal(
          <div
            className={`tree-drag-preview ${drag.drop && !drag.drop.allowed ? 'invalid' : ''}`}
            data-testid="tree-drag-preview"
            style={{
              left: Math.max(8, Math.min(drag.x - 230, window.innerWidth - 238)),
              top: Math.min(drag.y + 18, window.innerHeight - 65),
            }}
          >
            <strong>{drag.label}</strong>
            <span>
              {drag.drop
                ? drag.drop.allowed
                  ? `→ ${drag.drop.name}`
                  : 'Ei oman ryhmän sisään'
                : 'Vedä ryhmään tai Päätasolle'}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
