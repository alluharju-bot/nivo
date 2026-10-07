import { z } from 'zod';
import type { Project } from './project';

export const displayModes = ['solid', 'flat', 'ghost', 'wireframe'] as const;
export type DisplayMode = (typeof displayModes)[number];
export const displayLabels: Record<DisplayMode, string> = {
  solid: 'Solid',
  flat: 'Tasaväri',
  ghost: 'Ghost',
  wireframe: 'Wireframe',
};
export const modelDisplaySchema = z.object({
  mode: z.enum(displayModes),
  overrides: z
    .record(z.string().min(1).max(100), z.enum(displayModes))
    .refine((value) => Object.keys(value).length <= 10_000)
    .default({}),
});
export type ModelDisplay = z.infer<typeof modelDisplaySchema>;

export function bodyDisplayMode(display: ModelDisplay | undefined, id: string): DisplayMode {
  return display?.overrides[id] ?? display?.mode ?? 'solid';
}

/** No selection changes the whole view, including any earlier per-instance overrides. */
export function setModelDisplay(project: Project, mode: DisplayMode, ids: string[]): Project {
  const before = project.settings.modelDisplay;
  const selected = new Set(ids);
  const overrides: ModelDisplay['overrides'] = {};
  const global = ids.length ? (before?.mode ?? 'solid') : mode;
  if (ids.length)
    for (const body of project.bodies) {
      const value = selected.has(body.id) ? mode : bodyDisplayMode(before, body.id);
      if (value !== global) overrides[body.id] = value;
    }
  const next = { mode: global, overrides };
  if (
    global === (before?.mode ?? 'solid') &&
    JSON.stringify(overrides) === JSON.stringify(before?.overrides ?? {})
  )
    return project;
  return { ...project, settings: { ...project.settings, modelDisplay: next } };
}

/** The toolbar reports mixed modes instead of implying every selected part looks the same. */
export function commonDisplayMode(display: ModelDisplay | undefined, ids: string[]) {
  if (!ids.length) return display?.mode ?? 'solid';
  const mode = bodyDisplayMode(display, ids[0]);
  return ids.every((id) => bodyDisplayMode(display, id) === mode) ? mode : undefined;
}
