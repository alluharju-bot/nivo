import { test, expect } from 'vitest';
import { ActivityJournal, sameSelection } from './activity';
import { History } from './history';
import { freshProject, makeBody } from './project';

test('prepared selections consolidate into actions without losing previous action contexts', () => {
  const log = new ActivityJournal('p'),
    context = { ids: Array.from({ length: 48 }, (_, i) => `part-${i}`), groupId: 'g' };
  log.record({ label: 'Valinta: 48 kappaletta', context }, 'selection');
  log.record(
    { label: 'Valinta: 48 kappaletta', context: { ...context, ids: [...context.ids].reverse() } },
    'selection',
  );
  expect(log.entries).toHaveLength(1);
  log.record({ label: 'Siirretty 48 kappaletta · X +100 mm', context }, 'edit');
  expect(log.entries).toHaveLength(1);
  log.record({ label: 'Poistettu yksi osa', context: { ids: ['new'] } }, 'edit');
  expect(log.entries[1].context).toEqual(context);
  const loaded = new ActivityJournal('p', log.serialize());
  expect(loaded.entries).toEqual(log.entries);
  expect(new ActivityJournal('different', log.serialize()).entries).toEqual([]);
  expect(sameSelection(context, { ...context, openedAssembly: 'a' })).toBe(false);
});
test('lightweight journal respects both count and byte budgets with large selections', () => {
  const log = new ActivityJournal('p');
  for (let i = 0; i < 150; i++) log.record({ label: `Move ${i}`, context: { ids: ['a'] } }, 'edit');
  expect(log.entries).toHaveLength(100);
  const large = new ActivityJournal('p', undefined, 2000);
  for (let i = 0; i < 20; i++)
    large.record(
      { label: `Move ${i}`, context: { ids: Array.from({ length: 30 }, (_, i) => `part-${i}`) } },
      'edit',
    );
  expect(large.entries.length).toBeGreaterThan(0);
  expect(large.entries.length).toBeLessThan(20);
  expect(large.serialize().length * 2).toBeLessThanOrEqual(2000);
  expect(new ActivityJournal('p', 'broken').entries).toEqual([]);
});
test('undo action context survives snapshot adoption, redo, reload and branch replacement', () => {
  const start = freshProject(),
    part = makeBody(),
    context = { ids: [part.id] },
    a = { ...start, bodies: [part] },
    b = { ...a, name: 'Moved' };
  const history = new History(start);
  history.commit(a, { label: 'Luotu osa', context });
  history.commit(b, { label: 'Siirretty osa', context });
  history.undo();
  history.adopt({ ...history.current });
  expect(history.redoInfo).toEqual({ label: 'Siirretty osa', context });
  const restored = new History(history.current);
  expect(restored.restore(history.serialize())).toBe(true);
  expect(restored.undoInfo).toEqual({ label: 'Luotu osa', context });
  expect(restored.redoInfo).toEqual({ label: 'Siirretty osa', context });
  restored.redo();
  expect(restored.undoInfo?.label).toBe('Siirretty osa');
  restored.undo();
  restored.commit({ ...a, name: 'New branch' }, { label: 'Nimetty', context });
  expect(restored.redoInfo).toBeUndefined();
  expect(restored.undoInfo?.label).toBe('Nimetty');
});
