import { expect, it } from 'vitest';
import {
  freshProject,
  makeBody,
  MAX_PROJECT_BODIES,
  parseProject,
  projectSchema,
  projectValidationMessage,
} from './project';
import { translateSelection } from './groups';
import { History } from './history';

it('copies 296 parts to 592 and then 1184 with undo and file round-trip', () => {
  const original = {
    ...freshProject(),
    bodies: Array.from({ length: 296 }, (_, i) =>
      makeBody(500, 400, 18, [(i % 20) * 600, Math.floor(i / 20) * 500, 0]),
    ),
  };
  const history = new History(original);
  for (const count of [592, 1184]) {
    const { project } = translateSelection(
      history.current,
      history.current.bodies.map((b) => b.id),
      [0, 10000, 0],
      true,
    );
    history.commit(projectSchema.parse(project));
    expect(history.current.bodies).toHaveLength(count);
  }
  expect(parseProject(JSON.stringify(history.current))).toEqual(history.current);
  expect(history.undo().bodies).toHaveLength(592);
  expect(history.redo().bodies).toHaveLength(1184);
});

it('reports the part count limit without claiming that dimensions are invalid', () => {
  const part = makeBody(100, 100, 18);
  const result = projectSchema.safeParse({
    ...freshProject(),
    bodies: Array.from({ length: MAX_PROJECT_BODIES + 1 }, (_, i) => ({
      ...part,
      id: `part-${i}`,
    })),
  });
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected a part count error');
  const message = projectValidationMessage(result.error);
  expect(message).toContain('osaa');
  expect(message).toContain(MAX_PROJECT_BODIES.toLocaleString('fi-FI'));
  expect(message).not.toContain('mm');
});

it.each([-100001, 100001])('reports the actual coordinate limit for %s mm', (x) => {
  const result = projectSchema.safeParse({
    ...freshProject(),
    bodies: [{ ...makeBody(), origin: [x, 0, 0] }],
  });
  if (result.success) throw new Error('Expected a coordinate error');
  expect(projectValidationMessage(result.error)).toContain('100 000 mm');
});

it('keeps the actual group/reference error instead of a measurement error', () => {
  const result = projectSchema.safeParse({
    ...freshProject(),
    bodies: [{ ...makeBody(), groupId: 'missing-group' }],
  });
  if (result.success) throw new Error('Expected a missing group error');
  expect(projectValidationMessage(result.error)).toContain('puuttuvaan ryhmään');
});
