import { z } from 'zod';

const id = z.string().min(1).max(100);
export const sheetViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('standard'), view: z.enum(['front', 'right', 'top']) }),
  z.object({ kind: z.literal('section'), sectionId: id }),
]);
export const drawingSheetSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('visible') }),
    z.object({
      kind: z.literal('parts'),
      ids: z
        .array(id)
        .min(1)
        .max(10000)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
    z.object({ kind: z.literal('group'), groupId: id }),
  ]),
  views: z
    .array(sheetViewSchema)
    .min(1)
    .max(6)
    .refine((views) => new Set(views.map(sheetViewKey)).size === views.length),
  scale: z.number().finite().min(1).max(1000).optional(),
  hidden: z.boolean().default(false),
});
export type SheetView = z.infer<typeof sheetViewSchema>;
export type DrawingSheet = z.infer<typeof drawingSheetSchema>;
export function sheetViewKey(view: SheetView) {
  return view.kind === 'standard' ? view.view : `section:${view.sectionId}`;
}
