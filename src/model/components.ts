import { uid, type Body, type Project } from './project';
import { bodyLocked } from './groups';
import { defaultAppearance } from './materials';

export function asComponent(body: Body, id = body.component?.id ?? uid()): Body {
  return {
    ...body,
    purpose: 'component',
    component: {
      id,
      offset: body.component?.offset ?? body.textureFrame?.offset ?? [0, 0, 0],
      rotation: body.component?.rotation ?? body.textureFrame?.rotation ?? [0, 0, 0, 1],
    },
  };
}
export function uniqueComponents(project: Project, ids: string[], keepInternalLinks = false) {
  const selected = new Set(ids),
    families = new Map<string, string>();
  return {
    ...project,
    bodies: project.bodies.map((b) => {
      if (!selected.has(b.id)) return b;
      let component: Body['component'];
      if (keepInternalLinks && b.component) {
        if (!families.has(b.component.id)) families.set(b.component.id, uid());
        component = { ...b.component, id: families.get(b.component.id)! };
      }
      return {
        ...b,
        component,
        localMaterial: keepInternalLinks ? b.localMaterial : undefined,
        localTexture: keepInternalLinks ? b.localTexture : undefined,
      };
    }),
  };
}
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const surface = (body: Body) => body.appearance && { ...body.appearance, texture: undefined };

/** Changes in geometry propagate; instance placement and organisational properties do not.
 * One operation may change one definition. Conflicting edits of its instances
 * must be made unique first, never silently resolved by array order.
 */
export async function synchronizeComponents(
  before: Project,
  after: Project,
  instantiate: (source: Body, targets: Body[]) => Promise<Body[]>,
): Promise<Project> {
  if (before.id !== after.id) return after;
  const previous = new Map(before.bodies.map((b) => [b.id, b]));
  const geometry = new Map<string, Body>();
  const materials = new Map<string, Body>();
  for (const body of after.bodies) {
    const old = previous.get(body.id),
      family = body.component?.id;
    if (!family || old?.component?.id !== family) continue;
    const rotated = !same(old.component.rotation, body.component!.rotation);
    if (
      !rotated &&
      (!same(old.feature, body.feature) || !same(old.edgeTreatment, body.edgeTreatment))
    ) {
      if (geometry.has(family))
        throw new Error(
          'Sama linkitetty komponentti muuttuu eri tavoin useassa kohdassa. Tee työstettävistä osista ensin uniikkeja.',
        );
      geometry.set(family, body);
    }
    if (
      !body.localMaterial &&
      (!same(
        body.localTexture ? surface(old) : old.appearance,
        body.localTexture ? surface(body) : body.appearance,
      ) ||
        old.color !== body.color ||
        old.material !== body.material)
    ) {
      const earlier = materials.get(family);
      if (
        earlier &&
        (!same(surface(earlier), surface(body)) ||
          earlier.color !== body.color ||
          earlier.material !== body.material ||
          (!earlier.localTexture &&
            !body.localTexture &&
            !same(earlier.appearance?.texture, body.appearance?.texture)))
      )
        throw new Error(
          'Linkitetyille osille annettiin eri materiaalit. Valitse esiintymäkohtainen materiaali.',
        );
      materials.set(family, body);
    }
  }
  let bodies = after.bodies;
  for (const [family, source] of geometry) {
    const targets = bodies.filter((b) => b.id !== source.id && b.component?.id === family);
    if (targets.some((b) => bodyLocked(b, after.groups)))
      throw new Error(
        'Linkitetty kopio on Hold-kiinnitetty. Vapauta Hold tai tee muokattavasta osasta uniikki.',
      );
    const replacements = new Map((await instantiate(source, targets)).map((b) => [b.id, b]));
    bodies = bodies.map((b) => replacements.get(b.id) ?? b);
  }
  bodies = bodies.map((b) => {
    const source = !b.localMaterial && b.component && materials.get(b.component.id);
    return source
      ? {
          ...b,
          color: source.color,
          material: source.material,
          appearance:
            b.localTexture || source.localTexture
              ? {
                  ...(source.appearance ?? defaultAppearance(source.material)),
                  texture: (b.appearance ?? defaultAppearance(b.material)).texture,
                }
              : source.appearance,
        }
      : b;
  });
  return { ...after, bodies };
}
