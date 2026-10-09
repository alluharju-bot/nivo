import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Body, BodyGroup } from '../model/project';
import { groupPath } from '../model/groups';

/** Optional naming after creation: Tab enters, continuing work dismisses without stealing focus. */
export function NewPartPrompt({
  body,
  groups,
  busy,
  onApply,
  onClose,
}: {
  body: Body;
  groups: BodyGroup[];
  busy: boolean;
  onApply: (name: string, groupId?: string, newGroupName?: string) => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(body.name);
  const [group, setGroup] = useState(groupPath(groups, body.groupId));
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) latest.current();
    };
    const key = (e: KeyboardEvent) => {
      if (host.current?.contains(e.target as Node)) return;
      if (
        e.key === 'Tab' &&
        ((e.target as HTMLElement).matches('canvas') || e.target === document.body) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        input.current?.focus();
        input.current?.select();
      } else if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) latest.current();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
    };
  }, []);
  const apply = () => {
    const path = group.trim();
    const named = groups.filter((g) => g.name === path);
    const existing =
      groups.find((g) => groupPath(groups, g.id) === path) ??
      (named.length === 1 ? named[0] : undefined);
    if (name.trim()) onApply(name.trim(), existing?.id, path && !existing ? path : undefined);
  };
  return (
    <section
      ref={host}
      className="new-part-prompt"
      aria-label="Nimeä uusi osa"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header>
        <strong>Uusi osa</strong>
        <small>Tab nimeää · Enter tallentaa</small>
        <button aria-label="Ohita osan nimeäminen" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <label>
        Nimi
        <input
          ref={input}
          aria-label="Uuden osan nimi"
          value={name}
          maxLength={120}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Ryhmä
        <input
          aria-label="Uuden osan ryhmä"
          value={group}
          list="new-part-groups"
          maxLength={120}
          placeholder="Valitse tai kirjoita uusi"
          disabled={busy}
          onChange={(e) => setGroup(e.target.value)}
        />
      </label>
      <datalist id="new-part-groups">
        {groups.map((g) => (
          <option key={g.id} value={groupPath(groups, g.id)} />
        ))}
      </datalist>
      <button className="button subtle" disabled={busy || !name.trim()} onClick={apply}>
        Tallenna nimi ja ryhmä
      </button>
    </section>
  );
}
