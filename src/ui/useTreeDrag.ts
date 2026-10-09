import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { groupContains, bodyLocked, groupAncestors, type TreeMove } from '../model/groups';
import type { Body, BodyGroup } from '../model/project';

type Drop = { id: string; name: string; allowed: boolean; bodyId?: string; reason?: string };
type Drag = { move: TreeMove; label: string; x: number; y: number; drop?: Drop };
type Pending = Drag & { pointerId: number; startX: number; startY: number; active: boolean };

/** Pointer dragging also supports touch on the row's grip; the name remains scrollable. */
export function useTreeDrag(
  groups: BodyGroup[],
  bodies: Body[],
  disabled: boolean,
  onDrop: (move: TreeMove, parentId?: string, bodyId?: string) => void,
) {
  const tree = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ groups, bodies, disabled, onDrop });
  latest.current = { groups, bodies, disabled, onDrop };
  const [drag, setDrag] = useState<Drag>();

  useEffect(() => {
    let frame = 0;
    const target = (p: Pending): Drop | undefined => {
      const el = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('[data-tree-drop]');
      if (!el || !tree.current?.contains(el)) return;
      const id = el.dataset.treeDrop!;
      const body = latest.current.bodies.find((b) => b.id === el.dataset.treeBody);
      if (body) {
        const own =
          p.move.kind === 'bodies'
            ? p.move.ids.includes(body.id)
            : groupContains(latest.current.groups, p.move.id, body.groupId);
        const held =
          bodyLocked(body, latest.current.groups) ||
          latest.current.bodies.some(
            (b) =>
              (p.move.kind === 'bodies'
                ? p.move.ids.includes(b.id)
                : groupContains(latest.current.groups, p.move.id, b.groupId)) &&
              bodyLocked(b, latest.current.groups),
          ) ||
          (p.move.kind === 'group' &&
            groupAncestors(latest.current.groups, p.move.id).some((g) => g.locked));
        return {
          id: body.id,
          bodyId: body.id,
          name: `Luo ryhmä: ${body.name}`,
          allowed: !own && !held,
          reason: own
            ? 'Ei omaan osaan tai ryhmään'
            : held
              ? 'Vapauta kiinnitetyt osat ensin'
              : undefined,
        };
      }
      return {
        id,
        name: id ? (latest.current.groups.find((g) => g.id === id)?.name ?? '') : 'Päätaso',
        allowed: !(
          p.move.kind === 'group' &&
          id &&
          groupContains(latest.current.groups, p.move.id, id)
        ),
      };
    };
    const finish = () => {
      pending.current = null;
      cancelAnimationFrame(frame);
      setDrag(undefined);
    };
    const tick = () => {
      const p = pending.current;
      if (!p?.active) return;
      if (latest.current.disabled) {
        finish();
        return;
      }
      const list = tree.current?.querySelector<HTMLElement>('.object-list');
      if (list) {
        const r = list.getBoundingClientRect();
        if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
          const speed = p.y < r.top + 32 ? -9 : p.y > r.bottom - 32 ? 9 : 0;
          if (speed) {
            list.scrollTop += speed;
            p.drop = target(p);
            setDrag({ ...p });
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.active && Math.hypot(p.x - p.startX, p.y - p.startY) < 6) return;
      if (latest.current.disabled) {
        finish();
        return;
      }
      if (!p.active) {
        p.active = true;
        suppressClick.current = true;
        frame = requestAnimationFrame(tick);
      }
      e.preventDefault();
      p.drop = target(p);
      setDrag({ ...p });
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const drop = p.active ? target(p) : undefined;
      finish();
      if (drop?.allowed && !latest.current.disabled)
        latest.current.onDrop(p.move, drop.bodyId ? undefined : drop.id || undefined, drop.bodyId);
    };
    const cancel = () => finish();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pending.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
    };
  }, []);

  const start = (e: ReactPointerEvent<HTMLElement>, move: TreeMove, label: string) => {
    suppressClick.current = false;
    if (disabled || e.button !== 0 || !e.isPrimary || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('.tree-drag-grip')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pending.current = {
      move,
      label,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  };
  return { tree, drag, start, suppressClick };
}
