import { ExternalLink } from 'lucide-react';
import { productRepresentation, type ProductReference } from '../model/productReference';

export function ProductSource({ product }: { product: ProductReference }) {
  return (
    <details className="product-source-panel">
      <summary>Tuotetiedot · {product.brand}</summary>
      <strong>{product.name}</strong>
      {product.article && <span>Tuotekoodi: {product.article}</span>}
      {product.variant && product.variant !== product.article && <span>{product.variant}</span>}
      <span>{productRepresentation[product.representation]}</span>
      <a href={product.source} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={13} /> Valmistajan tiedot
      </a>
    </details>
  );
}
