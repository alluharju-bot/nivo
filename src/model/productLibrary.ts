import { freshProject, makeProfileBody, projectSchema, uid, type Project } from './project';
import { catalogCheckedAt, type CatalogProduct, type ProductVariant } from './productCatalog';
import { productReferenceSchema, type ProductReference } from './productReference';
import { sketchFrame, type Profile } from './sketch';

export function productReference(
  product: CatalogProduct,
  representation: ProductReference['representation'],
  variant?: ProductVariant,
): ProductReference {
  if (variant && product.variants && !product.variants.some((v) => v.article === variant.article))
    throw new Error('Valitse tuotekortin tuoteversio.');
  return productReferenceSchema.parse({
    catalogKey: product.key,
    brand: product.brand,
    name: product.name,
    article: variant?.article,
    variant: variant?.name,
    source: product.source,
    checkedAt: catalogCheckedAt,
    representation,
  });
}

export function productTitle(product: CatalogProduct, variant?: ProductVariant) {
  return `${product.brand} ${product.name}${variant ? ` · ${variant.name}` : ''}`.slice(0, 100);
}

/** Deliberately models only published installation dimensions, never invents a product mesh. */
export function installationProject(
  product: CatalogProduct,
  mode: 'space' | 'opening',
  variant?: ProductVariant,
): Project {
  const installation = product.installation;
  if (!installation || (mode === 'space' && !installation.depth))
    throw new Error('Tuotteella ei ole tarkistettuja asennusmittoja tähän toimintoon.');
  const p = installation.profile;
  const profile: Profile =
    p.kind === 'circle'
      ? { kind: 'circle', radius: p.diameter / 2 }
      : { kind: 'rectangle', width: p.width, depth: p.depth };
  const name = `${productTitle(product, variant)} · ${mode === 'space' ? 'upotustila' : 'aukko'}`;
  // z=0 is the mounting plane; material extends beneath it. Centre is the placement reference.
  const body = makeProfileBody(
    profile,
    sketchFrame(p.kind === 'circle' ? [0, 0, 0] : [-p.width / 2, -p.depth / 2, 0]),
    mode === 'space' ? -installation.depth! : 0,
    name,
    'component',
  );
  body.color = mode === 'space' ? '#819f9b' : '#d48154';
  body.material = 'matte';
  body.product = productReference(
    product,
    mode === 'space' ? 'installation-space' : 'opening-profile',
    variant,
  );
  return projectSchema.parse({ ...freshProject(), name, bodies: [body] });
}

/** Keep the user's file intact; a closed assembly makes multipart fittings easy to place. */
export function importedProductProject(
  source: Project,
  product: CatalogProduct,
  variant?: ProductVariant,
): Project {
  if (!source.bodies.length) throw new Error('Tiedostossa ei ollut tuotteen geometriaa.');
  const groupId = uid(),
    name = productTitle(product, variant);
  return projectSchema.parse({
    ...source,
    name,
    groups: [
      { id: groupId, name, kind: 'assembly', hidden: false },
      ...source.groups.map((g) => ({ ...g, parentId: g.parentId ?? groupId })),
    ],
    bodies: source.bodies.map((body) => ({
      ...body,
      name: source.bodies.length === 1 ? name : body.name,
      groupId: body.groupId ?? groupId,
      product: productReference(product, 'imported-model', variant),
    })),
  });
}
