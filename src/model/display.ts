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
  ghostOpacity: z.number().finite().min(0).max(1).optional(),
  ghostOpacities: z
    .record(z.string().min(1).max(100), z.number().finite().min(0).max(1))
    .refine((value) => Object.keys(value).length <= 10_000)
    .optional(),
});
export type ModelDisplay = z.infer<typeof modelDisplaySchema>;

export function bodyDisplayMode(display: ModelDisplay | undefined, id: string): DisplayMode {
  return display?.overrides[id] ?? display?.mode ?? 'solid';
}

export function bodyGhostOpacity(display: ModelDisplay | undefined, id: string): number {
  return display?.ghostOpacities?.[id] ?? display?.ghostOpacity ?? 0.16;
}

export function setGhostOpacity(project: Project, opacity: number, ids: string[]): Project {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new Error('Läpinäkyvyyden tulee olla 0–100 %.');
  const next = setModelDisplay(project, 'ghost', ids);
  const display = next.settings.modelDisplay!;
  const chosen = new Set(ids);
  const values = Object.fromEntries(
    project.bodies
      .filter((b) => chosen.has(b.id) || display.ghostOpacities?.[b.id] !== undefined)
      .map((b) => [b.id, chosen.has(b.id) ? opacity : display.ghostOpacities![b.id]]),
  );
  const updated = ids.length
    ? { ...display, ghostOpacities: values }
    : { ...display, ghostOpacity: opacity, ghostOpacities: {} };
  if (JSON.stringify(updated) === JSON.stringify(project.settings.modelDisplay)) return project;
  return { ...next, settings: { ...next.settings, modelDisplay: updated } };
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
  const next = { ...before, mode: global, overrides };
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
