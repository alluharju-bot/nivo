import { expect, test } from 'vitest';
import { freshProject, makeBody, projectSchema } from './project';
import { shareProjectData } from './sharing';
import { History } from './history';

test('validation reuses untouched bodies and CAD features across edits and undo', () => {
  const before = { ...freshProject(), bodies: [makeBody(), makeBody()] };
  const renamed = shareProjectData(
    before,
    projectSchema.parse({
      ...before,
      bodies: [{ ...before.bodies[0], name: 'Door' }, before.bodies[1]],
    }),
  );
  expect(renamed.bodies[0]).not.toBe(before.bodies[0]);
  expect(renamed.bodies[0].feature).toBe(before.bodies[0].feature);
  expect(renamed.bodies[1]).toBe(before.bodies[1]);
  const history = new History(before);
  history.commit(renamed);
  expect(history.undo()).toBe(before);
});
test('large snapshots trim the oldest in-memory undo entries without changing the current model', () => {
  const project = { ...freshProject(), bodies: [makeBody()] };
  const history = new History(project, JSON.stringify(project).length * 2 * 3.1);
  for (let i = 0; i < 20; i++) history.commit({ ...project, name: `Step ${i}` });
  expect(history.current.name).toBe('Step 19');
  expect(history.undo().name).toBe('Step 18');
  expect(history.undo().name).toBe('Step 17');
  expect(history.canUndo).toBe(false);
  expect(history.redo().name).toBe('Step 18');
});
