import { describe, expect, it } from 'vitest';
import { productCatalog, searchProducts } from './productCatalog';
import { importedProductProject, installationProject } from './productLibrary';
import { bounds, freshProject, makeBody, parseProject, projectSchema } from './project';
import { mergeProject, selectionProject } from './projectImport';
import { History } from './history';

const twist = productCatalog.find((p) => p.key === 'savo-twist')!;

it('finds variants, accented manufacturers and multiple search terms without conflating filters', () => {
  expect(searchProducts('savo 79934').map((p) => p.key)).toEqual(['savo-twist']);
  expect(searchProducts('hafele loox', 'lighting').map((p) => p.key)).toEqual([
    'hafele-loox2062',
    'hafele-loox2068',
  ]);
  expect(searchProducts('savo', 'hardware')).toEqual([]);
  expect(searchProducts('', '', 'Hettich')).toHaveLength(7);
  expect(searchProducts('')).toHaveLength(productCatalog.length);
  expect(new Set(productCatalog.map((p) => p.key)).size).toBe(productCatalog.length);
  for (const p of productCatalog) {
    expect(new URL(p.source).protocol).toBe('https:');
    if (p.cad) expect(new URL(p.cad.url).protocol).toBe('https:');
  }
});

it('centres the TWIST opening at z=0 and reserves 40 mm below the mounting plane', () => {
  const project = installationProject(twist, 'space', twist.variants![2]);
  expect(bounds(project.bodies)).toEqual({ min: [-52.5, -52.5, -40], max: [52.5, 52.5, 0] });
  expect(project.bodies[0].product).toMatchObject({
    catalogKey: 'savo-twist',
    article: '79934',
    variant: 'Mattamusta',
    representation: 'installation-space',
  });
  const opening = installationProject(twist, 'opening');
  expect(bounds(opening.bodies)).toEqual({ min: [-52.5, -52.5, 0], max: [52.5, 52.5, 0] });
  expect(opening.bodies[0].feature.type).toBe('profile-extrusion');
  expect(opening.bodies[0].product?.representation).toBe('opening-profile');
});

it('uses rectangular opening dimensions rather than the cover dimensions', () => {
  const voltti = productCatalog.find((p) => p.key === 'savo-voltti')!;
  expect(bounds(installationProject(voltti, 'space').bodies)).toEqual({
    min: [-107.5, -44, -53],
    max: [107.5, 44, 0],
  });
});

it('does not invent a depth, an unverified multi-hole spacing or a variant', () => {
  expect(() =>
    installationProject(
      productCatalog.find((p) => p.key === 'savo-elevator')!,
      'space',
    ),
  ).toThrow('asennusmittoja');
  expect(() =>
    installationProject(
      productCatalog.find((p) => p.key === 'savo-due')!,
      'opening',
    ),
  ).toThrow('asennusmittoja');
  expect(() => installationProject(twist, 'space', { name: 'wrong', article: '000' })).toThrow(
    'tuoteversio',
  );
});

describe.each(productCatalog.filter((p) => p.installation))('$key', (product) => {
  it('creates valid independent CAD references for all supported actions', () => {
    const a = installationProject(product, 'opening');
    const b = installationProject(product, product.installation?.depth ? 'space' : 'opening');
    expect(a.bodies[0].id).not.toBe(b.bodies[0].id);
    expect(a.id).not.toBe(b.id);
    expect(projectSchema.safeParse(a).success).toBe(true);
    expect(projectSchema.safeParse(b).success).toBe(true);
  });
});

it('preserves provenance and exact geometry through serialization, library extraction, merge and undo', () => {
  const reference = installationProject(twist, 'space', twist.variants![0]);
  const incoming = parseProject(JSON.stringify(reference));
  const savedPart = selectionProject(incoming, [incoming.bodies[0].id], incoming.name);
  expect(savedPart.bodies[0].product).toEqual(reference.bodies[0].product);
  const project = { ...freshProject(), bodies: [makeBody(500, 300, 18)] };
  const merged = mergeProject(project, savedPart).project;
  expect(merged.bodies[1].product).toEqual(reference.bodies[0].product);
  expect(merged.bodies[1].feature).toEqual(reference.bodies[0].feature);
  expect(merged.bodies[1].id).not.toBe(reference.bodies[0].id);
  const history = new History(project);
  history.commit(merged);
  history.undo();
  expect(history.current.bodies).toHaveLength(1);
  history.redo();
  expect(history.current.bodies[1].product?.catalogKey).toBe('savo-twist');
});

it('wraps a multipart imported fitting in one assembly without altering materials, geometry or child groups', () => {
  const body = makeBody(10, 20, 30, [7, 8, 9]);
  const second = { ...makeBody(2, 3, 4), groupId: 'inner' };
  const incoming = {
    ...freshProject(),
    bodies: [body, second],
    groups: [{ id: 'inner', name: 'Inner', hidden: false }],
  };
  const next = importedProductProject(incoming, twist, twist.variants![0]);
  expect(next.groups[0].kind).toBe('assembly');
  expect(next.groups[1].parentId).toBe(next.groups[0].id);
  expect(next.bodies[0].groupId).toBe(next.groups[0].id);
  expect(next.bodies[1].groupId).toBe('inner');
  expect(next.bodies[0].feature).toEqual(body.feature);
  expect(next.bodies[0].origin).toEqual(body.origin);
  expect(next.bodies[0].color).toEqual(body.color);
  expect(incoming.bodies[0]).not.toHaveProperty('product');
  expect(next.bodies[0].product?.representation).toBe('imported-model');
  expect(() => importedProductProject(freshProject(), twist)).toThrow('geometriaa');
});

it('rejects executable source URLs in imported product metadata', () => {
  const p = installationProject(twist, 'space');
  p.bodies[0].product!.source = 'javascript:alert(1)';
  expect(projectSchema.safeParse(p).success).toBe(false);
});
