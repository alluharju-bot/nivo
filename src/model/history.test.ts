import { expect, it } from 'vitest';
import { History } from './history';
import { freshProject, makeBody, parseProject } from './project';

it('restores both directions, and a new edit discards the restored redo branch', () => {
  const start = freshProject(),
    first = { ...start, bodies: [makeBody(600, 400, 18)] };
  const second = { ...first, bodies: [{ ...first.bodies[0], name: 'Ovi' }] };
  const history = new History(start);
  history.commit(first);
  history.commit(second);
  history.undo();
  const restored = new History(history.current);
  expect(restored.restore(history.serialize())).toBe(true);
  expect(restored.peekUndo()).toEqual(start);
  expect(restored.peekRedo()).toEqual(second);
  restored.redo();
  restored.undo();
  restored.commit({ ...first, name: 'Uusi haara' });
  expect(restored.canRedo).toBe(false);
  expect(restored.undo()).toEqual(first);
});

it('bounds saved history by bytes and steps, retaining the nearest undo steps', () => {
  const history = new History(freshProject());
  for (let i = 0; i < 30; i++) history.commit({ ...history.current, name: `Vaihe ${i}` });
  const snapshot = JSON.parse(history.serialize()!);
  expect(snapshot.past).toHaveLength(20);
  expect(snapshot.past.at(-1).name).toBe('Vaihe 28');
  const small = history.serialize(2000)!;
  expect(new TextEncoder().encode(small).length).toBeLessThanOrEqual(2000);
  expect(JSON.parse(small).past.at(-1).name).toBe('Vaihe 28');
  expect(history.serialize(5)).toBeUndefined();
  expect(history.peekUndo()?.name).toBe('Vaihe 28');
});

it('ignores corrupt, mismatched and unsupported history without changing the active model', () => {
  const initial = freshProject(),
    history = new History(initial);
  history.commit({ ...initial, name: 'Nykyinen' });
  const active = history.current,
    valid = history.serialize()!;
  for (const value of [
    'not json',
    JSON.stringify({ ...JSON.parse(valid), version: 999 }),
    JSON.stringify({ ...JSON.parse(valid), current: initial }),
    JSON.stringify({ ...JSON.parse(valid), past: [{ broken: true }] }),
  ]) {
    expect(history.restore(value)).toBe(false);
    expect(history.current).toEqual(active);
    expect(history.canUndo).toBe(false);
  }
  expect(history.restore(valid)).toBe(true);
  expect(history.peekUndo()).toEqual(initial);
});

it('stores an image once across undo snapshots and restores imports after undo', () => {
  const first = {
    ...freshProject(),
    assets: {
      texture: {
        name: 'image.png',
        width: 1,
        height: 1,
        dataUrl: 'data:image/png;base64,' + 'A'.repeat(10000),
      },
    },
  };
  const history = new History(first);
  for (let i = 0; i < 10; i++) history.commit({ ...first, name: `Stage ${i}` });
  const serialized = history.serialize()!;
  expect(serialized.match(/data:image\/png;base64/g)).toHaveLength(1);
  expect(serialized.length).toBeLessThan(20000);
  const restored = new History(history.current);
  expect(restored.restore(serialized)).toBe(true);
  expect(restored.undo().assets).toEqual(first.assets);
});
it('migrates version 5 project history together with the active project', () => {
  const start = { ...freshProject(), version: 5 },
    old = { ...start, name: 'Old current' };
  const current = parseProject(JSON.stringify(old)),
    history = new History(current);
  expect(
    history.restore(JSON.stringify({ version: 1, current: old, past: [start], future: [] })),
  ).toBe(true);
  expect(history.undo().version).toBe(7);
});
