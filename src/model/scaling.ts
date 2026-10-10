import { Matrix3, Quaternion, Matrix4 } from 'three';
import { bounds, type Body, type Project, type Vec3, type Axis } from './project';
import { add, sub, unit } from './geometry';
import { requireMovable } from './transforms';
import { uniqueComponents } from './components';
import { guideVector } from './guides';

export interface Scaling {
  ids: string[];
  pivot: Vec3;
  factors: Vec3;
  mode: 'uniform' | Axis | 'xy' | 'xz' | 'yz';
  picking?: boolean;
  unique?: boolean;
}
export const scalePoint = (p: Vec3, pivot: Vec3, factors: Vec3): Vec3 =>
  p.map((n, i) => pivot[i] + (n - pivot[i]) * factors[i]) as Vec3;
export const scaleVector = (p: Vec3, factors: Vec3): Vec3 =>
  p.map((n, i) => n * factors[i]) as Vec3;
export function scaleFactor(text: string) {
  const s = text.trim().replace(',', '.').replace(/[×x]$/i, '').trim();
  const value = Number(s);
  if (!s || !Number.isFinite(value) || value <= 0 || value > 1000)
    throw new Error('Anna positiivinen skaalauskerroin, enintään 1000. Esimerkiksi 0,5 tai 2.');
  return value;
}
export function scaleSize(bodies: Body[]): Vec3 {
  const box = bounds(bodies);
  return sub(box.max, box.min);
}
export function factorsFor(mode: Scaling['mode'], factor: number): Vec3 {
  return (['x', 'y', 'z'] as const).map((axis) =>
    scaleAxes(mode).includes(axis) ? factor : 1,
  ) as Vec3;
}
export function scaleAxes(mode: Scaling['mode']): Axis[] {
  return (['x', 'y', 'z'] as const).filter((axis) => mode === 'uniform' || mode.includes(axis));
}
export function toggleScaleAxis(mode: Scaling['mode'], axis: Axis): Scaling['mode'] {
  const selected = scaleAxes(mode);
  const next = (['x', 'y', 'z'] as const).filter((a) =>
    a === axis ? !selected.includes(a) : selected.includes(a),
  );
  if (!next.length) return mode;
  return next.length === 3 ? 'uniform' : (next.join('') as Scaling['mode']);
}
export function scalingFactor(s: Scaling): number {
  return s.factors[['x', 'y', 'z'].indexOf(scaleAxes(s.mode)[0])];
}
/** The original AABB supplies stable handles throughout a drag. */
export function scaleHandles(s: Scaling, bodies: Body[]) {
  const parts = bodies.filter((b) => s.ids.includes(b.id));
  if (!parts.length) return [];
  const { min, max } = bounds(parts);
  const center = min.map((v, i) => (v + max[i]) / 2) as Vec3;
  const handles: { point: Vec3; mode: Scaling['mode']; color: string }[] = [];
  for (let n = 0; n < 8; n++)
    handles.push({
      point: [0, 1, 2].map((i) => (n & (1 << i) ? max[i] : min[i])) as Vec3,
      mode: s.mode,
      color: '#e3a450',
    });
  (['x', 'y', 'z'] as const).forEach((axis, i) => {
    if (max[i] - min[i] < 1e-6 || !scaleAxes(s.mode).includes(axis)) return;
    for (const side of [min[i], max[i]]) {
      const point = [...center] as Vec3;
      point[i] = side;
      handles.push({
        point,
        mode: s.mode === 'uniform' ? axis : s.mode,
        color: ['#cf6864', '#5a9a6c', '#568bc6'][i],
      });
    }
  });
  return handles.map((h) => ({ ...h, point: scalePoint(h.point, s.pivot, s.factors) }));
}
/** Prepare one definition per linked family. Other selected instances only change
 * placement; the normal component synchronizer updates their geometry once. */
export function prepareScaling(project: Project, s: Scaling) {
  const parts = project.bodies.filter((b) => s.ids.includes(b.id));
  requireMovable(parts, project.groups);
  if (
    ![...s.pivot, ...s.factors].every(Number.isFinite) ||
    s.factors.some((f) => f <= 0 || f > 1000)
  )
    throw new Error('Skaalauskertoimien tulee olla positiivisia, enintään 1000.');
  const base = s.unique ? uniqueComponents(project, s.ids) : project;
  const sources: Body[] = [],
    families = new Map<string, { body: Body; matrix: number[] }>();
  const bodies = base.bodies.map((body) => {
    if (!s.ids.includes(body.id)) return body;
    const family = body.component?.id;
    if (!family) {
      sources.push(body);
      return body;
    }
    const rotation = new Matrix3().setFromMatrix4(
      new Matrix4().makeRotationFromQuaternion(new Quaternion(...body.component!.rotation)),
    );
    const local = rotation
      .clone()
      .transpose()
      .multiply(new Matrix3().set(s.factors[0], 0, 0, 0, s.factors[1], 0, 0, 0, s.factors[2]))
      .multiply(rotation).elements;
    const source = families.get(family);
    if (!source) {
      families.set(family, { body, matrix: local });
      sources.push(body);
      return body;
    }
    if (local.some((n, i) => Math.abs(n - source.matrix[i]) > 1e-7))
      throw new Error(
        'Eri suuntiin kierretyt linkitetyt kopiot venyisivät eri tavoin. Valitse ”Vain valitut · tee uniikeiksi” tai skaalaa tasaisesti.',
      );
    const anchor = add(body.origin, body.component!.offset);
    return {
      ...body,
      origin: add(body.origin, sub(scalePoint(anchor, s.pivot, s.factors), anchor)),
    };
  });
  for (const family of families.keys())
    requireMovable(
      base.bodies.filter((b) => b.component?.id === family),
      base.groups,
    );
  return { project: { ...base, bodies }, sources };
}
export function applyScaling(project: Project, results: Body[], s: Scaling): Project {
  const replacements = new Map(results.map((b) => [b.id, b]));
  return {
    ...project,
    bodies: project.bodies.map((b) => replacements.get(b.id) ?? b),
    guides: project.guides.map((g) => {
      const anchor = 'edge' in g.anchor ? g.anchor.edge.from : g.anchor;
      if (!('bodyId' in anchor) || !s.ids.includes(anchor.bodyId)) return g;
      return {
        ...g,
        direction: unit(scaleVector(guideVector(g), s.factors)),
        length: g.length * Math.hypot(...scaleVector(guideVector(g), s.factors)),
        offset: g.offset ? scaleVector(g.offset, s.factors) : undefined,
      };
    }),
  };
}
