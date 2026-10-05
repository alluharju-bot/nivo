import { describe, expect, it } from 'vitest';
import { upsertGuide } from './guideMerge';
import { moveGuideEndpoint } from './guideEditing';
import { guidePoints } from './guides';
import { freshProject, makeBody, type Guide, type Vec3 } from './project';
import { History } from './history';

const line = (id: string, a: Vec3, b: Vec3): Guide => ({
  id,
  mode: 'free',
  anchor: { point: a },
  endAnchor: { point: b },
  plane: 'XY',
  angle: 0,
  length: Math.hypot(...b.map((n, i) => n - a[i])),
});
const horizontal = (id: string, a: number, b: number) => line(id, [a, 0, 13], [b, 0, 13]);

describe('overlapping finite measurements', () => {
  it('unions a center-to-corner stroke with the return through the center, keeping the older id', () => {
    const first = line('first', [300, 300, 13], [600, 600, 13]);
    const result = upsertGuide([], [first], line('back', [600, 600, 13], [0, 0, 13]));
    expect(result.guides).toHaveLength(1);
    expect(result.guide.id).toBe('first');
    expect(guidePoints([], result.guide)).toEqual([
      [0, 0, 13],
      [600, 600, 13],
    ]);
    expect(result.guide.length).toBeCloseTo(Math.sqrt(2) * 600);
    expect(result.merged).toBe(true);
    expect(result.unchanged).toBe(false);
  });
  it.each([
    [0, 100],
    [100, 0],
    [25, 75],
    [75, 25],
  ])('does not change the model for a repeated or contained stroke %s → %s', (a, b) => {
    const guides = [horizontal('old', 0, 100)];
    const result = upsertGuide([], guides, horizontal('new', a, b));
    expect(result.guides).toBe(guides);
    expect(result.guide).toBe(guides[0]);
    expect(result.unchanged).toBe(true);
  });
  it.each([
    [0, 75, 50, 100],
    [75, 0, 100, 50],
    [50, 100, 0, 75],
  ])('joins partial overlaps in either direction', (a, b, c, d) => {
    const result = upsertGuide([], [horizontal('old', a, b)], horizontal('new', c, d));
    expect(result.guides).toHaveLength(1);
    expect(
      guidePoints([], result.guide)!
        .map((p) => p[0])
        .sort((a, b) => a - b),
    ).toEqual([0, 100]);
  });
  it('joins a stroke spanning multiple intervals and overlapping legacy strokes regardless of order', () => {
    const a = horizontal('a', 0, 100),
      b = horizontal('b', 150, 250),
      c = horizontal('c', 230, 300);
    const result = upsertGuide([], [c, a, b], horizontal('join', 50, 200));
    expect(result.guides).toHaveLength(1);
    expect(result.guide.id).toBe('c');
    expect(guidePoints([], result.guide)).toEqual([
      [0, 0, 13],
      [300, 0, 13],
    ]);
  });
  it('keeps shared endpoints, crossings, gaps, nearby parallels and different heights independent', () => {
    const unrelated = [
      horizontal('touch', 100, 200),
      horizontal('gap', 200, 250),
      line('cross', [50, -50, 13], [50, 50, 13]),
      line('parallel', [0, 0.01, 13], [100, 0.01, 13]),
      line('height', [0, 0, 13.01], [100, 0, 13.01]),
      line('angle', [0, 0, 13], [100, 0.1, 13]),
      { ...horizontal('infinite', 0, 100), mode: 'guide' as const },
    ];
    const result = upsertGuide([], unrelated, horizontal('new', 0, 100));
    expect(result.guides).toEqual([...unrelated, horizontal('new', 0, 100)]);
    unrelated.forEach((g, i) => expect(result.guides[i]).toBe(g));
    expect(result.merged).toBe(false);
  });
  it('handles actual 3D collinearity with a negative origin and different stored drawing planes', () => {
    const first = line('first', [-100, -200, -50], [0, 0, 0]);
    const second = { ...line('second', [-50, -100, -25], [100, 200, 50]), plane: 'YZ' as const };
    const result = upsertGuide([], [first], second);
    expect(guidePoints([], result.guide)).toEqual([
      [-100, -200, -50],
      [100, 200, 50],
    ]);
    expect(result.guide.length).toBeCloseTo(Math.hypot(200, 400, 100));
  });
  it('preserves the outer geometry anchors and x-ray visibility when extending', () => {
    const body = makeBody(600, 400, 13);
    const from = { bodyId: body.id, key: 'corner:1', local: [0, 0, 13] as Vec3 };
    const to = { bodyId: body.id, key: 'corner:5', local: [600, 0, 13] as Vec3 };
    const old = { ...horizontal('old', 0, 350), anchor: from, xray: true };
    const next = { ...horizontal('next', 250, 600), endAnchor: to };
    const result = upsertGuide([body], [old], next);
    expect(result.guide.anchor).toEqual(from);
    expect(result.guide.endAnchor).toEqual(to);
    expect(result.guide.xray).toBe(true);
    expect(guidePoints([{ ...body, origin: [0, 0, 98] }], result.guide)).toEqual([
      [0, 0, 111],
      [600, 0, 111],
    ]);
  });
  it('handles offset lines, missing references and replacement of a moved endpoint', () => {
    const old = {
      ...horizontal('old', 0, 100),
      offset: [0, 38, 0] as Vec3,
      endAnchor: { point: [100, 38, 13] as Vec3 },
    };
    const unrelated = {
      ...horizontal('missing', 0, 100),
      anchor: { bodyId: 'absent', key: 'corner:1', local: [0, 0, 0] as Vec3 },
    };
    const result = upsertGuide([], [unrelated, old], line('next', [50, 38, 13], [150, 38, 13]));
    expect(result.guides[0]).toBe(unrelated);
    expect(guidePoints([], result.guide)).toEqual([
      [0, 38, 13],
      [150, 38, 13],
    ]);
    const guides = [horizontal('a', 0, 100), horizontal('b', 150, 250)];
    const moved = moveGuideEndpoint(
      [],
      guides,
      { guideId: 'b', end: 0 },
      { point: [50, 0, 13] },
    )[1];
    const edited = upsertGuide([], guides, moved);
    expect(edited.guide.id).toBe('b');
    expect(edited.guides).toHaveLength(1);
    expect(guidePoints([], edited.guide)).toEqual([
      [0, 0, 13],
      [250, 0, 13],
    ]);
  });
  it('records a union in one undo step while a duplicate preserves the redo branch', () => {
    const initial = { ...freshProject(), guides: [horizontal('a', 0, 100)] };
    const history = new History(initial);
    const merged = upsertGuide([], history.current.guides, horizontal('b', 50, 200));
    history.commit({ ...history.current, guides: merged.guides });
    history.undo();
    expect(history.current.guides).toEqual(initial.guides);
    const duplicate = upsertGuide([], history.current.guides, horizontal('duplicate', 100, 0));
    if (!duplicate.unchanged) history.commit({ ...history.current, guides: duplicate.guides });
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(guidePoints([], history.current.guides[0])).toEqual([
      [0, 0, 13],
      [200, 0, 13],
    ]);
  });
});
