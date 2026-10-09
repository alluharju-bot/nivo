import { expect, it } from 'vitest';
import { History } from './history';
import { freshProject, makeBody, noteMarkupSchema } from './project';
import { hiddenItems, revealItems } from './visibility';

it('restores whole hide batches across edits, undo/redo and saved history', () => {
  const p = {
    ...freshProject(),
    bodies: [makeBody(10, 10, 10), makeBody(20, 20, 20), makeBody(30, 30, 30)],
  };
  const history = new History(p);
  history.commit({ ...p, bodies: p.bodies.map((b, i) => (i < 2 ? { ...b, hidden: true } : b)) });
  const first = history.lastHidden();
  expect(first.size).toBe(2);
  history.commit({ ...history.current, name: 'Unrelated rename' });
  history.commit({
    ...history.current,
    bodies: history.current.bodies.map((b) => ({ ...b, hidden: true })),
  });
  expect([...history.lastHidden()]).toEqual([`bodies:${p.bodies[2].id}`]);
  history.undo();
  expect(history.lastHidden()).toEqual(first);
  history.redo();
  const restored = new History(history.current);
  expect(restored.restore(history.serialize())).toBe(true);
  restored.commit(revealItems(restored.current, restored.lastHidden()));
  expect(restored.lastHidden()).toEqual(first);
  restored.commit(revealItems(restored.current, restored.lastHidden()));
  expect(hiddenItems(restored.current).size).toBe(0);
  expect(restored.lastHidden().size).toBe(0);
});

it('reveals nested held parts and every annotation kind without changing geometry or locks', () => {
  const body = { ...makeBody(10, 10, 10), hidden: true, locked: true, groupId: 'child' };
  const p = {
    ...freshProject(),
    bodies: [body],
    groups: [
      { id: 'parent', name: 'Parent', hidden: true, locked: true },
      { id: 'child', name: 'Child', parentId: 'parent', hidden: true, locked: false },
    ],
    annotations: [
      noteMarkupSchema.parse({
        id: 'note',
        kind: 'note',
        hidden: true,
        text: 'Note',
        anchor: { point: [0, 0, 0] },
        fallback: [0, 0, 0],
        offset: [20, 0, 0],
      }),
    ],
  };
  p.settings.measurementsHidden = true;
  p.settings.markupsHidden = true;
  const one = revealItems(p, new Set([`bodies:${body.id}`]));
  expect(one.groups.every((g) => !g.hidden)).toBe(true);
  expect(one.annotations?.[0].hidden).toBe(true);
  const all = revealItems(p, hiddenItems(p));
  expect(hiddenItems(all).size).toBe(0);
  expect(all.bodies[0].feature).toBe(body.feature);
  expect(all.bodies[0].locked).toBe(true);
  expect(all.groups[0].locked).toBe(true);
});

it('does not treat imported hidden items or another project as a hide operation', () => {
  const p = freshProject(),
    history = new History(p);
  history.commit({ ...p, bodies: [{ ...makeBody(10, 10, 10), hidden: true }] });
  expect(history.lastHidden().size).toBe(0);
  const visible = {
    ...history.current,
    bodies: history.current.bodies.map((b) => ({ ...b, hidden: false })),
  };
  history.commit(visible);
  history.commit({ ...visible, bodies: visible.bodies.map((b) => ({ ...b, hidden: true })) });
  expect(history.lastHidden().size).toBe(1);
  history.commit({ ...history.current, id: 'another-project' });
  expect(history.lastHidden().size).toBe(0);
});
