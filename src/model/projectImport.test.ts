import { expect, it } from 'vitest';
import { asComponent } from './components';
import { freshProject, makeBody, projectSchema, uid } from './project';
import { defaultAppearance } from './materials';
import { mergeProject, selectionProject } from './projectImport';
import { resolveAnchor } from './guides';

it('merges the same model twice without crossing component families or losing group/anchor/material identities', () => {
  const project = freshProject(),
    folder = uid(),
    assembly = uid(),
    asset = uid(),
    type = uid();
  const first = asComponent({
    ...makeBody(100, 60, 20, [5, 8, 11], 'Ovi'),
    groupId: assembly,
    partTypeId: type,
    appearance: { ...defaultAppearance('wood'), assetId: asset, maps: { normal: asset } },
  });
  const second = { ...first, id: uid(), origin: [200, 8, 11] as [number, number, number] };
  project.name = 'Kaluste';
  project.bodies = [first, second];
  project.groups = [
    { id: folder, name: 'Huone', hidden: false },
    { id: assembly, name: 'Kaappi', hidden: false, parentId: folder, kind: 'assembly' },
  ];
  project.partTypes = [{ id: type, name: 'Ovi', unit: 'count' }];
  project.assets = {
    [asset]: { name: 'kuva', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 },
  };
  project.guides = [
    {
      id: uid(),
      anchor: { bodyId: first.id, key: 'corner:0', local: [0, 0, 0] },
      mode: 'free',
      plane: 'XY',
      angle: 0,
      length: 50,
    },
  ];
  const one = mergeProject(project, project),
    two = mergeProject(one.project, project);
  expect(two.project.bodies).toHaveLength(6);
  expect(new Set(two.project.bodies.map((b) => b.id)).size).toBe(6);
  expect(new Set(two.project.bodies.map((b) => b.component!.id)).size).toBe(3);
  expect(two.project.partTypes).toHaveLength(1);
  expect(two.project.groups.filter((g) => g.kind === 'assembly')).toHaveLength(3);
  expect(two.project.settings).toEqual(project.settings);
  expect(two.project.guides.map((g) => resolveAnchor(two.project.bodies, g.anchor))).toEqual([
    [5, 8, 11],
    [5, 8, 11],
    [5, 8, 11],
  ]);
  expect(Object.keys(two.project.assets!)).toHaveLength(3);
  expect(two.project.bodies[4].appearance!.assetId).not.toBe(first.appearance!.assetId);
  expect(projectSchema.safeParse(two.project).success).toBe(true);
});
it('keeps same-named types with different units distinct and extracts only selected library geometry', () => {
  const first = freshProject(),
    second = freshProject(),
    t1 = uid(),
    t2 = uid();
  first.partTypes = [{ id: t1, name: 'Lauta', unit: 'length' }];
  second.partTypes = [{ id: t2, name: 'Lauta', unit: 'count' }];
  second.bodies = [{ ...makeBody(), partTypeId: t2 }, makeBody()];
  const merged = mergeProject(first, second).project;
  expect(merged.partTypes!.map((t) => t.name)).toEqual(['Lauta', 'Lauta (2)']);
  const extracted = selectionProject(merged, [merged.bodies[0].id], 'Laudelauta');
  expect(extracted.name).toBe('Laudelauta');
  expect(extracted.bodies).toHaveLength(1);
  expect(extracted.partTypes).toHaveLength(1);
  expect(extracted.bodies[0].id).not.toBe(merged.bodies[0].id);
});
it('detaches a saved face from drawing sources that are outside the library selection', () => {
  const project = freshProject(),
    source = makeBody(),
    face = makeBody();
  face.penRegion = { sources: [source.id], owner: source.id, origin: [0, 0, 0] };
  project.bodies = [source, face];
  expect(selectionProject(project, [face.id], 'Pinta').bodies[0].penRegion).toBeUndefined();
  expect(
    selectionProject(project, [source.id, face.id], 'Piirros').bodies[1].penRegion?.sources,
  ).toHaveLength(1);
});
