import {
  freshProject,
  projectSchema,
  projectValidationMessage,
  uid,
  type Project,
} from './project';
import { groupAncestors } from './groups';
import { typeNameKey } from './quantitySchema';

/** Clone identity-bearing records, while leaving geometry and user text untouched. */
export function reidentifyProject(source: Project): Project {
  const ids = new Map<string, string>();
  const mapped = (id: string) => {
    if (!ids.has(id)) ids.set(id, uid());
    return ids.get(id)!;
  };
  const walk = (value: unknown, field = ''): unknown => {
    if (typeof value === 'string') {
      if (
        field === 'id' ||
        field === 'owner' ||
        field === 'ids' ||
        field === 'sources' ||
        (field.endsWith('Id') && field !== 'topologyId')
      )
        return mapped(value);
      return value;
    }
    if (Array.isArray(value))
      return typeof value[0] === 'number' ? value : value.map((item) => walk(item, field));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        field === 'assets' ? mapped(key) : key,
        field === 'maps' && typeof item === 'string' ? mapped(item) : walk(item, key),
      ]),
    );
  };
  const result = walk(source) as Project;
  // Join-generated anchor keys can contain a source body ID. Topology IDs stay local to a body.
  const key = (value: string) =>
    value
      .split(':')
      .map((part) => ids.get(part) ?? part)
      .join(':');
  const references = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (typeof value[0] !== 'number') value.forEach(references);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.key === 'string') record.key = key(record.key);
    if (record.vertexRefs)
      record.vertexRefs = Object.fromEntries(
        Object.entries(record.vertexRefs).map(([name, point]) => [key(name), point]),
      );
    Object.values(record).forEach(references);
  };
  references(result);
  return result;
}

export function mergeProject(target: Project, source: Project) {
  const incoming = reidentifyProject(source);
  const group = {
    id: uid(),
    name: source.name.slice(0, 120),
    hidden: false,
    kind: 'folder' as const,
  };
  const partTypes = [...(target.partTypes ?? [])];
  const typeIds = new Map<string, string>();
  for (const type of incoming.partTypes ?? []) {
    const same = partTypes.find(
      (t) => typeNameKey(t.name) === typeNameKey(type.name) && t.unit === type.unit,
    );
    if (same) {
      typeIds.set(type.id, same.id);
      continue;
    }
    let name = type.name,
      count = 2;
    while (partTypes.some((t) => typeNameKey(t.name) === typeNameKey(name)))
      name = `${type.name.slice(0, 65)} (${count++})`;
    partTypes.push({ ...type, name });
  }
  const bodies = incoming.bodies.map((b) => ({
    ...b,
    groupId: b.groupId ?? group.id,
    partTypeId: b.partTypeId ? (typeIds.get(b.partTypeId) ?? b.partTypeId) : undefined,
  }));
  const candidate = {
    ...target,
    bodies: [...target.bodies, ...bodies],
    groups: [
      ...target.groups,
      group,
      ...incoming.groups.map((g) => ({ ...g, parentId: g.parentId ?? group.id })),
    ],
    partTypes,
    assets: { ...target.assets, ...incoming.assets },
    dimensions: [...target.dimensions, ...incoming.dimensions],
    guides: [...target.guides, ...incoming.guides],
    annotations: [...(target.annotations ?? []), ...(incoming.annotations ?? [])],
    sections: [...(target.sections ?? []), ...(incoming.sections ?? [])],
    drawingSheets: [...(target.drawingSheets ?? []), ...(incoming.drawingSheets ?? [])],
    referenceImages: [...(target.referenceImages ?? []), ...(incoming.referenceImages ?? [])],
    materials: [...(target.materials ?? []), ...(incoming.materials ?? [])],
    // Imported presentation cameras and lighting must not move the current workspace.
  };
  const parsed = projectSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(projectValidationMessage(parsed.error));
  return { project: parsed.data, group, ids: bodies.map((b) => b.id) };
}

export function selectionProject(project: Project, ids: string[], name: string): Project {
  const selected = new Set(ids);
  const bodies = project.bodies
    .filter((b) => selected.has(b.id))
    .map((body) =>
      body.penRegion &&
      (!selected.has(body.penRegion.owner) ||
        body.penRegion.sources.some((id) => !selected.has(id)))
        ? { ...body, penRegion: undefined }
        : body,
    );
  if (!bodies.length) throw new Error('Valitse kirjastoon tallennettavat osat.');
  const groups = new Set(
    bodies.flatMap((b) =>
      b.groupId ? [b.groupId, ...groupAncestors(project.groups, b.groupId).map((g) => g.id)] : [],
    ),
  );
  const types = new Set(bodies.map((b) => b.partTypeId));
  const assets = new Set<string>();
  for (const b of bodies)
    for (const appearance of [
      b.appearance,
      ...Object.values(b.faceMaterials ?? {}).map((f) => f.appearance),
    ]) {
      if (appearance?.assetId) assets.add(appearance.assetId);
      Object.values(appearance?.maps ?? {}).forEach((id) => {
        if (id) assets.add(id);
      });
    }
  return reidentifyProject(
    projectSchema.parse({
      ...freshProject(),
      name,
      bodies,
      groups: project.groups.filter((g) => groups.has(g.id)),
      partTypes: project.partTypes?.filter((t) => types.has(t.id)),
      assets: Object.fromEntries(
        Object.entries(project.assets ?? {}).filter(([id]) => assets.has(id)),
      ),
    }),
  );
}
