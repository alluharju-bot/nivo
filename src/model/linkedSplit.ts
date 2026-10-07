import type { KnifeResult } from '../cad/modeling';
import { type Body, type Project, uid } from './project';
import { add, sub } from './geometry';
import { bodyLocked } from './groups';

/** Each resulting piece gets its own shared definition, placed in every original instance frame. */
export async function linkSplitCopies(
  project: Project,
  split: KnifeResult,
  instantiate: (source: Body, targets: Body[]) => Promise<Body[]>,
): Promise<KnifeResult> {
  const originals = new Map(project.bodies.map((b) => [b.id, b]));
  const changed = new Map(split.bodies.map((b) => [b.id, b]));
  const replacements = { ...split.replacements };
  const affected = new Set(split.affected),
    pieces = new Set(split.pieces);
  const families = new Set<string>();
  for (const id of split.affected) {
    const source = originals.get(id)!;
    if (!source.component) continue;
    const family = source.component.id;
    if (families.has(family))
      throw new Error(
        'Veitsi osuu saman komponentin useaan kopioon. Valitse yksi kopio yhteistä leikkausta varten tai valitse Tee kohteista uniikkeja.',
      );
    families.add(family);
    const targets = project.bodies.filter((b) => b.id !== id && b.component?.id === family);
    if (targets.some((b) => bodyLocked(b, project.groups)))
      throw new Error(
        'Linkitetty kopio on Hold-lukittu. Vapauta Hold tai valitse Tee kohteista uniikkeja.',
      );
    for (const target of targets) replacements[target.id] = [];
    for (const [index, pieceId] of replacements[id].entries()) {
      const part = changed.get(pieceId)!;
      const definition = uid();
      const linked: Body = {
        ...part,
        component: {
          ...source.component,
          id: definition,
          offset: sub(add(source.origin, source.component.offset), part.origin),
        },
      };
      changed.set(pieceId, linked);
      const placed = await instantiate(
        linked,
        targets.map((target) => ({
          ...target,
          id: index === 0 ? target.id : uid(),
          name: `${target.name.slice(0, 110)} · ${index + 1}`,
          component: { ...target.component!, id: definition },
        })),
      );
      for (const [i, copy] of placed.entries()) {
        changed.set(copy.id, copy);
        replacements[targets[i].id].push(copy.id);
        pieces.add(copy.id);
        affected.add(targets[i].id);
      }
    }
  }
  return {
    bodies: [...changed.values()],
    replacements,
    pieces: [...pieces],
    affected: [...affected],
  };
}
