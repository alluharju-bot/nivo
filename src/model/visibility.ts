import type { Project } from './project';
import { groupAncestors } from './groups';

const collections = ['bodies', 'groups', 'guides', 'dimensions', 'annotations'] as const;
export type HiddenItems = Set<string>;

export function hiddenItems(project: Project): HiddenItems {
  const hidden = new Set<string>();
  for (const collection of collections)
    for (const item of project[collection] ?? [])
      if (item.hidden) hidden.add(`${collection}:${item.id}`);
  if (project.settings.measurementsHidden) hidden.add('measurements');
  if (project.settings.markupsHidden) hidden.add('markups');
  return hidden;
}

/** Only existing items changing from visible to hidden count as a hide action. */
export function newlyHidden(before: Project, after: Project): HiddenItems {
  const hidden = new Set<string>();
  for (const collection of collections) {
    if (before[collection] === after[collection]) continue;
    const visible = new Set((before[collection] ?? []).filter((v) => !v.hidden).map((v) => v.id));
    for (const item of after[collection] ?? [])
      if (item.hidden && visible.has(item.id)) hidden.add(`${collection}:${item.id}`);
  }
  if (!before.settings.measurementsHidden && after.settings.measurementsHidden)
    hidden.add('measurements');
  if (!before.settings.markupsHidden && after.settings.markupsHidden) hidden.add('markups');
  return hidden;
}

export function revealItems(project: Project, items: HiddenItems): Project {
  const shown = new Set(items);
  // An individually restored object must also be visible through its parent folders.
  for (const body of project.bodies)
    if (shown.has(`bodies:${body.id}`))
      groupAncestors(project.groups, body.groupId).forEach((g) => shown.add(`groups:${g.id}`));
  for (const group of project.groups)
    if (shown.has(`groups:${group.id}`))
      groupAncestors(project.groups, group.parentId).forEach((g) => shown.add(`groups:${g.id}`));
  if ([...shown].some((key) => key.startsWith('guides:') || key.startsWith('dimensions:')))
    shown.add('measurements');
  if ([...shown].some((key) => key.startsWith('annotations:'))) shown.add('markups');
  return {
    ...project,
    ...Object.fromEntries(
      collections.map((collection) => [
        collection,
        project[collection]?.map((item) =>
          item.hidden && shown.has(`${collection}:${item.id}`) ? { ...item, hidden: false } : item,
        ),
      ]),
    ),
    settings: {
      ...project.settings,
      ...(shown.has('measurements') ? { measurementsHidden: false } : {}),
      ...(shown.has('markups') ? { markupsHidden: false } : {}),
    },
  };
}
