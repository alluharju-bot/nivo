import { makeBody, uid, type Body, type BodyGroup, type Project, type Vec3 } from './project';
import { defaultAppearance } from './materials';
import { bodyLocked } from './groups';

export type CabinetOptions = {
  name: string;
  width: number;
  depth: number;
  height: number;
  thickness: number;
  joints: 'sides-full' | 'caps-full';
  back: 'none' | 'inset' | 'overlay';
  backThickness: number;
  backInset: number;
  shelves: number;
  shelfInset: number;
  doors: 'none' | 'single' | 'double';
  doorGap: number;
  origin: Vec3;
};
export const cabinetDefaults: CabinetOptions = {
  name: 'Kaappi',
  width: 600,
  depth: 600,
  height: 720,
  thickness: 18,
  joints: 'sides-full',
  back: 'inset',
  backThickness: 6,
  backInset: 12,
  shelves: 1,
  shelfInset: 20,
  doors: 'none',
  doorGap: 2,
  origin: [0, 0, 0],
};
export type CabinetPanel = {
  key: string;
  name: string;
  size: Vec3;
  origin: Vec3;
  role: 'side' | 'cap' | 'back' | 'shelf' | 'door';
};
/** A geometric panel layout, before CAD creation. All dimensions are millimetres. */
export function cabinetPlan(o: CabinetOptions): CabinetPanel[] {
  const { width: w, depth: d, height: h, thickness: t, backThickness: b } = o;
  if (!o.name.trim() || o.name.trim().length > 120)
    throw new Error('Anna rungolle nimi (1–120 merkkiä).');
  if (![w, d, h, t, b, o.backInset, o.shelfInset, o.doorGap, ...o.origin].every(Number.isFinite))
    throw new Error('Tarkista rungon mitat.');
  if ([w, d, h].some((n) => n < 1 || n > 100_000) || t < 0.1 || w - 2 * t < 1 || h - 2 * t < 1)
    throw new Error('Levyjen väliin pitää jäädä vähintään 1 mm vapaata leveyttä ja korkeutta.');
  if (!Number.isInteger(o.shelves) || o.shelves < 0 || o.shelves > 20)
    throw new Error('Hyllyjen määrä voi olla 0–20.');
  if (o.backInset < 0 || o.shelfInset < 0 || o.doorGap < 0 || (o.back !== 'none' && b < 0.1))
    throw new Error(
      'Sisennykset eivät voi olla negatiivisia. Taustalevyn paksuuden tulee olla vähintään 0,1 mm.',
    );
  const panelDepth = d - (o.back === 'overlay' ? b : 0);
  const insideBack = o.back === 'none' ? d : d - b - (o.back === 'inset' ? o.backInset : 0);
  if (panelDepth < 1 || insideBack < 1 || (o.shelves && insideBack - o.shelfInset < 1))
    throw new Error('Taustan ja etureunan väliin pitää jäädä vähintään 1 mm syvyyttä.');
  const opening = h - 2 * t;
  if (opening - o.shelves * t < o.shelves + 1)
    throw new Error(
      'Hyllyjen väliin pitää jäädä vähintään 1 mm tilaa. Vähennä hyllyjä tai kasvata korkeutta.',
    );
  const panels: CabinetPanel[] = [];
  const add = (key: string, name: string, role: CabinetPanel['role'], size: Vec3, local: Vec3) => {
    const origin = local.map((v, i) => v + o.origin[i]) as Vec3;
    if (
      size.some((v) => v < 0.1) ||
      origin.some((v, i) => Math.abs(v) > 100_000 || Math.abs(v + size[i]) > 100_000)
    )
      throw new Error('Osan mitat tai sijainti ylittävät mallinnusalueen.');
    panels.push({ key, name, size, origin, role });
  };
  const sidesFull = o.joints === 'sides-full';
  add(
    'left',
    'Vasen sivu',
    'side',
    [t, panelDepth, sidesFull ? h : h - 2 * t],
    [0, 0, sidesFull ? 0 : t],
  );
  add(
    'right',
    'Oikea sivu',
    'side',
    [t, panelDepth, sidesFull ? h : h - 2 * t],
    [w - t, 0, sidesFull ? 0 : t],
  );
  add(
    'bottom',
    'Pohja',
    'cap',
    [sidesFull ? w - 2 * t : w, panelDepth, t],
    [sidesFull ? t : 0, 0, 0],
  );
  add(
    'top',
    'Kansi',
    'cap',
    [sidesFull ? w - 2 * t : w, panelDepth, t],
    [sidesFull ? t : 0, 0, h - t],
  );
  if (o.back === 'inset')
    add('back', 'Tausta', 'back', [w - 2 * t, b, h - 2 * t], [t, insideBack, t]);
  if (o.back === 'overlay') add('back', 'Tausta', 'back', [w, b, h], [0, insideBack, 0]);
  const gap = (opening - o.shelves * t) / (o.shelves + 1);
  for (let i = 0; i < o.shelves; i++)
    add(
      `shelf-${i}`,
      `Hylly ${i + 1}`,
      'shelf',
      [w - 2 * t, insideBack - o.shelfInset, t],
      [t, o.shelfInset, t + gap * (i + 1) + t * i],
    );
  if (o.doors !== 'none') {
    const g = o.doorGap,
      count = o.doors === 'double' ? 2 : 1;
    const doorWidth = (w - g * (count + 1)) / count;
    if (doorWidth < 1 || h - 2 * g < 1)
      throw new Error('Oven raot ovat liian suuret rungon mittoihin nähden.');
    for (let i = 0; i < count; i++)
      add(
        `door-${i}`,
        count === 1 ? 'Ovi' : i === 0 ? 'Vasen ovi' : 'Oikea ovi',
        'door',
        [doorWidth, t, h - 2 * g],
        [g + i * (doorWidth + g), -t, g],
      );
  }
  return panels;
}

export function cabinetBodies(panels: CabinetPanel[], groupId: string, preview = false): Body[] {
  return panels.map((p) => ({
    ...makeBody(...p.size, p.origin, p.name),
    id: preview ? `cabinet-${p.key}` : uid(),
    groupId,
    purpose: 'component' as const,
    color: p.role === 'back' ? '#d9d1c2' : '#e4dfd3',
    appearance: defaultAppearance('paint'),
  }));
}

/** One immutable edit: the original model is retained unless a replacement is explicitly chosen. */
export function insertCabinet(project: Project, options: CabinetOptions, replaceId?: string) {
  const source = replaceId ? project.bodies.find((b) => b.id === replaceId) : undefined;
  if (replaceId && !source) throw new Error('Korvattavaa osaa ei löydy.');
  if (source && bodyLocked(source, project.groups))
    throw new Error('Vapauta lähtöosan Hold ennen sen korvaamista.');
  const group: BodyGroup = {
    id: uid(),
    name: options.name.trim(),
    kind: 'assembly',
    hidden: false,
    locked: false,
    parentId: source?.groupId,
  };
  const panels = cabinetPlan(options),
    bodies = cabinetBodies(panels, group.id);
  return {
    group,
    bodies,
    project: {
      ...project,
      groups: [...project.groups, group],
      bodies: [...project.bodies.filter((b) => b.id !== replaceId), ...bodies],
    },
  };
}
