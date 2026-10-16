import { z } from 'zod';
import { drawingViews } from './drawingViews';
import { highlightStyle } from './highlightStyle';

const id = z.string().min(1).max(100);
export const drawingScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visible') }),
  z.object({ kind: z.literal('group'), groupId: id }),
  z.object({ kind: z.literal('parts'), ids: z.array(id).max(10000) }),
]);
export const drawingPageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('view'), view: z.enum(drawingViews), scope: drawingScopeSchema }),
  z.object({ kind: z.literal('section'), sectionId: id, scope: drawingScopeSchema }),
  z.object({ kind: z.literal('sheet'), sheetId: id }),
]);
/** Page annotations use paper millimetres: notes keep a readable printed size at every scale. */
export const drawingAnnotationSchema = z
  .object({
    ...highlightStyle,
    id,
    page: drawingPageSchema,
    kind: z.enum(['note', 'highlight']),
    x: z.number().finite().min(10).max(283),
    y: z.number().finite().min(10).max(196),
    width: z.number().finite().min(4).max(277),
    height: z.number().finite().min(4).max(190),
    text: z.string().max(1200),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    fontSize: z.number().finite().min(2.5).max(7),
    bold: z.boolean(),
    hidden: z.boolean().optional(),
  })
  .refine(
    (m) => m.x + m.width <= 287.001 && m.y + m.height <= 200.001,
    'Merkinnän tulee mahtua arkille.',
  );
export type DrawingAnnotation = z.infer<typeof drawingAnnotationSchema>;
export type DrawingPage = z.infer<typeof drawingPageSchema>;
export type DrawingScope = z.infer<typeof drawingScopeSchema>;
export function drawingScope(target: string, ids: string[]): DrawingScope {
  return target.startsWith('group:')
    ? { kind: 'group', groupId: target.slice(6) }
    : target.startsWith('body:')
      ? { kind: 'parts', ids: [target.slice(5)] }
      : target === 'selection'
        ? { kind: 'parts', ids: [...ids].sort() }
        : { kind: 'visible' };
}
export function drawingPageKey(page: DrawingPage): string {
  const scope =
    page.kind === 'sheet'
      ? ''
      : page.scope.kind === 'group'
        ? ['group', page.scope.groupId]
        : page.scope.kind === 'parts'
          ? ['parts', [...page.scope.ids].sort()]
          : 'visible';
  return JSON.stringify([
    page.kind,
    page.kind === 'view' ? page.view : page.kind === 'section' ? page.sectionId : page.sheetId,
    scope,
  ]);
}
