import { expect, it } from 'vitest';
import { freshProject, makeBody, parseProject } from '../model/project';
import { mergeProject } from '../model/projectImport';
import {
  drawingAnnotationSchema,
  drawingPageKey,
  type DrawingAnnotation,
} from '../model/drawingAnnotations';
import { annotateSheet, fitAnnotation } from './pageAnnotations';
import { History } from '../model/history';
const note: DrawingAnnotation = {
  id: 'note',
  page: { kind: 'view', view: 'front', scope: { kind: 'visible' } },
  kind: 'note',
  x: 260,
  y: 175,
  width: 60,
  height: 12,
  text: 'Tarkista <kiinnitys> & sauma',
  color: '#b18b35',
  fontSize: 3.2,
  bold: false,
};
it('keeps annotations inside the paper and escapes exported user content without selection handles', () => {
  const fitted = fitAnnotation(note);
  expect(drawingAnnotationSchema.safeParse(fitted).success).toBe(true);
  expect(fitted.x + fitted.width).toBeLessThanOrEqual(287);
  const sheet = annotateSheet(
    { svg: '<svg></svg>', fits: true, orphanCount: 0, transform: { x: 0, y: 0, scale: 20 } },
    [fitted],
  );
  expect(sheet.svg).toContain('&lt;kiinnitys&gt;');
  expect(sheet.svg).not.toContain('data-annotation-resize');
  expect(annotateSheet({ ...sheet, svg: '<svg></svg>' }, [{ ...fitted, hidden: true }]).svg).toBe(
    '<svg></svg>',
  );
});
it('persists and undoes notes without changing geometry; importing remaps sheet identities and limits visible scope', () => {
  const p = freshProject();
  p.bodies = [makeBody()];
  const history = new History(p);
  const next = { ...p, drawingAnnotations: [fitAnnotation(note)] };
  history.commit(next);
  expect(history.undo().drawingAnnotations).toBeUndefined();
  const restored = parseProject(JSON.stringify(next));
  expect(restored.drawingAnnotations).toEqual(next.drawingAnnotations);
  const merged = mergeProject(freshProject(), restored).project;
  expect(merged.drawingAnnotations![0].page).toEqual({
    kind: 'view',
    view: 'front',
    scope: { kind: 'group', groupId: merged.bodies[0].groupId },
  });
  expect(
    drawingPageKey({ kind: 'view', view: 'front', scope: { kind: 'parts', ids: ['b', 'a'] } }),
  ).toBe(
    drawingPageKey({ kind: 'view', view: 'front', scope: { kind: 'parts', ids: ['a', 'b'] } }),
  );
});
