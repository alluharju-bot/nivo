import type { ViewportProps } from './types';
import {
  uid,
  type Markup,
  type AreaMarkup,
  type NoteMarkup,
  type Anchor,
  type Vec3,
} from '../model/project';
import { toUV, sketchFrame, type SketchFrame } from '../model/sketch';
import { add, sub } from '../model/geometry';
import { notePosition } from '../model/markups';
type Pick = { point: Vec3; anchor: Anchor };
export function markupInteractions({
  current,
  host,
  canvas,
  pick,
  start,
  pointOnFrame,
  viewNormal,
}: {
  current: () => ViewportProps;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  pick: (e: PointerEvent) => Pick | undefined;
  start: (e: PointerEvent) => { point: Vec3; frame: SketchFrame } | undefined;
  pointOnFrame: (e: PointerEvent, f: SketchFrame, snap: boolean) => Vec3 | undefined;
  viewNormal: () => Vec3;
}) {
  let epoch = -1,
    area: AreaMarkup | undefined,
    corner: Vec3 | undefined,
    note: NoteMarkup | undefined,
    preview: Markup | undefined;
  let press:
    | {
        x: number;
        y: number;
        stage: 'start' | 'end' | 'note' | 'drag';
        source?: NoteMarkup;
        grab?: Vec3;
        frame?: SketchFrame;
      }
    | undefined;
  const active = () =>
    current().tool === 'measure' && ['area', 'note'].includes(current().measureMode);
  const sync = () => {
    if (epoch !== current().epoch) {
      epoch = current().epoch;
      area = undefined;
      corner = undefined;
      note = undefined;
      preview = undefined;
      press = undefined;
    }
  };
  const publish = (m?: Markup) => {
    preview = m;
    current().onMarkupPreview?.(m);
  };
  const defaults = () => current().markupStyle!;
  const hit = (e: { clientX: number; clientY: number }) => {
    for (const el of [
      ...host.querySelectorAll<SVGGElement>('.model-markups [data-markup]'),
    ].reverse()) {
      const box = el.querySelector('.markup-label')?.getBoundingClientRect();
      if (
        box &&
        e.clientX >= box.left - 4 &&
        e.clientX <= box.right + 4 &&
        e.clientY >= box.top - 4 &&
        e.clientY <= box.bottom + 4
      )
        return current().markups?.find((m) => m.id === el.dataset.markup);
      const path = el.querySelector<SVGPathElement>('.area-fill'),
        matrix = path?.getScreenCTM();
      if (
        path &&
        matrix &&
        path.isPointInFill(new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()))
      )
        return current().markups?.find((m) => m.id === el.dataset.markup);
    }
  };
  const update = (e: PointerEvent) => {
    if (press?.stage === 'drag' && press.source && press.frame && press.grab) {
      const p = pointOnFrame(e, press.frame, false);
      if (p) publish({ ...press.source, offset: add(press.source.offset, sub(p, press.grab)) });
      return;
    }
    if (note) {
      const p = pointOnFrame(e, sketchFrame(note.fallback, viewNormal()), false);
      if (p) publish({ ...note, ...defaults().note, offset: sub(p, note.fallback) });
      return;
    }
    if (area && corner) {
      const p = pointOnFrame(e, area.frame, true);
      if (!p) return;
      const a = toUV(corner, area.frame),
        b = toUV(p, area.frame);
      const r: [number, number, number, number] = [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ];
      publish({
        ...area,
        ...defaults().area,
        rectangles:
          r[2] - r[0] >= 0.1 && r[3] - r[1] >= 0.1 ? [...area.rectangles, r] : area.rectangles,
      });
      return;
    }
    if (active()) {
      if (current().measureMode === 'area') start(e);
      else pick(e);
    }
  };
  const finishRect = () => {
    if (preview?.kind === 'area' && area && preview.rectangles.length > area.rectangles.length) {
      area = preview;
      corner = undefined;
      publish(area);
    }
  };
  const down = (e: PointerEvent) => {
    sync();
    if (e.button !== 0 || current().busy) return false;
    const candidate =
      current().tool === 'select' || (active() && current().measureMode === 'note' && !note)
        ? hit(e)
        : undefined;
    // A colored area is a valid target for a new note, not a reason to leave the tool.
    const found = current().tool === 'select' || candidate?.kind === 'note' ? candidate : undefined;
    if (found) {
      current().onMarkupSelect?.(found.id, e.shiftKey);
      if (found.kind === 'note' && !e.shiftKey) {
        const frame = sketchFrame(
          notePosition(found, current().markupBodies ?? current().bodies),
          viewNormal(),
        );
        press = {
          x: e.clientX,
          y: e.clientY,
          stage: 'drag',
          source: found,
          frame,
          grab: pointOnFrame(e, frame, false),
        };
        canvas.setPointerCapture(e.pointerId);
      }
      canvas.focus({ preventScroll: true });
      return true;
    }
    if (!active()) return false;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    if (current().measureMode === 'area') {
      if (corner) {
        update(e);
        finishRect();
        press = undefined;
        return true;
      }
      if (area && area.rectangles.length >= 64) {
        current().onSnap('Enintään 64 suorakulmiota yhdessä alueessa. Hyväksy Enterillä.');
        return true;
      }
      const first = area ? undefined : start(e),
        p = area ? pointOnFrame(e, area.frame, true) : first?.point;
      if (!p) return true;
      if (!area)
        area = { id: uid(), kind: 'area', ...defaults().area, frame: first!.frame, rectangles: [] };
      corner = p;
      press = { x: e.clientX, y: e.clientY, stage: 'start' };
      publish(area);
    } else {
      if (note) {
        update(e);
        if (preview?.kind === 'note') current().onMarkupCommit?.(preview);
        note = undefined;
        publish();
        press = undefined;
        return true;
      }
      const target = pick(e);
      if (!target) return true;
      note = {
        id: uid(),
        kind: 'note',
        ...defaults().note,
        anchor: target.anchor,
        fallback: target.point,
        offset: [0, 0, 0],
      };
      publish(note);
      press = { x: e.clientX, y: e.clientY, stage: 'note' };
    }
    return true;
  };
  return {
    sync,
    hit,
    active,
    down,
    move(e: PointerEvent) {
      sync();
      if (press?.stage === 'drag' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4)
        return true;
      if (active() || press?.stage === 'drag') {
        update(e);
        return true;
      }
      return false;
    },
    up(e: PointerEvent) {
      sync();
      if (!active() && press?.stage !== 'drag') return false;
      const p = press;
      press = undefined;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
        if (p.stage === 'drag' && preview?.kind === 'note') {
          current().onMarkupCommit?.(preview);
          publish();
        } else if (p.stage === 'start') {
          update(e);
          finishRect();
        } else if (p.stage === 'note') {
          update(e);
          if (preview?.kind === 'note') current().onMarkupCommit?.(preview);
          note = undefined;
          publish();
        }
      } else if (p?.stage === 'drag') publish();
      return true;
    },
    command(action: 'finish' | 'back') {
      sync();
      if (action === 'back') {
        if (corner) {
          corner = undefined;
          publish(area);
          return;
        }
        if (area) {
          area = { ...area, rectangles: area.rectangles.slice(0, -1) };
          publish(area);
        }
        return;
      }
      if (area) {
        finishRect();
        if (area.rectangles.length) {
          current().onMarkupCommit?.({ ...area, ...defaults().area });
          area = undefined;
          corner = undefined;
          publish();
        }
      } else if (preview?.kind === 'note') {
        current().onMarkupCommit?.({ ...preview, ...defaults().note });
        note = undefined;
        publish();
      }
    },
  };
}
