import { describe, expect, it } from 'vitest';
import { freshProject, makeBody, parseProject } from './project';
import { assertHolds } from './holds';
import { asComponent } from './components';
import {
  bodyDisplayMode,
  commonDisplayMode,
  setModelDisplay,
  setGhostOpacity,
  bodyGhostOpacity,
} from './display';

describe('model display is an instance view setting', () => {
  it('persists per-part ghost opacity without changing materials or linked geometry, and can reset the whole view', () => {
    const a = { ...asComponent(makeBody(), 'family'), locked: true },
      b = asComponent(makeBody(), 'family');
    const project = { ...freshProject(), bodies: [a, b] };
    const next = setGhostOpacity(project, 0.4, [a.id]);
    expect(next.bodies).toBe(project.bodies);
    expect(() => assertHolds(project, next)).not.toThrow();
    const saved = parseProject(JSON.stringify(next));
    expect(bodyGhostOpacity(saved.settings.modelDisplay, a.id)).toBe(0.4);
    expect(bodyDisplayMode(saved.settings.modelDisplay, b.id)).toBe('solid');
    const restored = setModelDisplay(next, 'solid', [a.id]);
    expect(bodyGhostOpacity(restored.settings.modelDisplay, a.id)).toBe(0.4);
    const all = setGhostOpacity(next, 0.7, []);
    expect(bodyGhostOpacity(all.settings.modelDisplay, a.id)).toBe(0.7);
    expect(bodyGhostOpacity(all.settings.modelDisplay, b.id)).toBe(0.7);
    expect(all.settings.modelDisplay!.ghostOpacities).toEqual({});
    expect(() => setGhostOpacity(next, NaN, [a.id])).toThrow();
    expect(() => setGhostOpacity(next, 1.01, [a.id])).toThrow();
  });
  it('changes a held selection without touching materials, geometry or linked copies', () => {
    const a = { ...asComponent(makeBody(), 'family'), locked: true },
      b = asComponent(makeBody(), 'family');
    const project = { ...freshProject(), bodies: [a, b] };
    const next = setModelDisplay(project, 'ghost', [a.id]);
    expect(next.bodies).toBe(project.bodies);
    expect(() => assertHolds(project, next)).not.toThrow();
    const restored = parseProject(JSON.stringify(next));
    expect(bodyDisplayMode(restored.settings.modelDisplay, a.id)).toBe('ghost');
    expect(bodyDisplayMode(restored.settings.modelDisplay, b.id)).toBe('solid');
    expect(restored.bodies).toEqual(project.bodies);
    expect(commonDisplayMode(next.settings.modelDisplay, [a.id, b.id])).toBeUndefined();
  });

  it('sets the entire view explicitly and lets one part differ again', () => {
    const a = makeBody(),
      b = makeBody();
    const project = { ...freshProject(), bodies: [a, b] };
    const selected = setModelDisplay(project, 'ghost', [a.id]);
    const all = setModelDisplay(selected, 'flat', []);
    expect(all.settings.modelDisplay).toEqual({ mode: 'flat', overrides: {} });
    const exception = setModelDisplay(all, 'solid', [a.id]);
    expect(bodyDisplayMode(exception.settings.modelDisplay, a.id)).toBe('solid');
    expect(bodyDisplayMode(exception.settings.modelDisplay, b.id)).toBe('flat');
    expect(setModelDisplay(exception, 'solid', [a.id])).toBe(exception);
    expect(setModelDisplay(project, 'solid', [])).toBe(project);
  });

  it('opens old projects as solid and rejects unrecognised display data', () => {
    const project = freshProject();
    expect(
      bodyDisplayMode(parseProject(JSON.stringify(project)).settings.modelDisplay, 'old'),
    ).toBe('solid');
    expect(() =>
      parseProject(
        JSON.stringify({
          ...project,
          settings: {
            ...project.settings,
            modelDisplay: { mode: 'flat', overrides: { old: 'invisible' } },
          },
        }),
      ),
    ).toThrow();
  });
});
